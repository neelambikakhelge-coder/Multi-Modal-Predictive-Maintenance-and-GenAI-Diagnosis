"""Exercise feature handlers in isolation without loading the large ML models."""
import ast
import asyncio
import io
import os
from pathlib import Path
import secrets
import hashlib
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from contextlib import closing
from typing import List, Optional
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd
from fastapi import Depends, File, HTTPException, UploadFile
from passlib.context import CryptContext
from pydantic import BaseModel
import re


class RequestedFeaturesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        names = {
            "init_database", "RegisterRequest", "ForgotPasswordRequest",
            "ResetPasswordRequest", "hash_password", "forgot_password",
            "reset_password", "_label_health", "upload_dataset", "reset_dataset",
            "new_recovery_code", "recovery_code_hash", "RecoveryCodeRequest",
            "RecoverPasswordRequest", "generate_recovery_code", "recover_password", "register",
        }
        source = ast.parse(Path("main.py").read_text(encoding="utf-8"))
        nodes = []
        for node in source.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name in names:
                node.decorator_list = []
                nodes.append(node)
        self.mail = Mock()
        self.scope = dict(globals(), DATABASE_FILE=os.path.join(self.temp.name, "test.db"),
            UPLOAD_DIR=os.path.join(self.temp.name, "uploads"), DATA_FILE="default.csv",
            STATE={"data_file": "default.csv", "dataset_label": "default"},
            sensor_columns=["sensor_2"],
            REQUIRED_RAW_COLUMNS=["unit", "cycle", "setting_1", "setting_2", "setting_3"] + [f"sensor_{i}" for i in range(1, 22)],
            pwd_context=CryptContext(schemes=["argon2"]),
            get_current_user=lambda: {}, send_password_reset_email=self.mail)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "main.py", "exec"), self.scope)
        self.scope["init_database"]()
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db, db:
            db.execute("INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)",
                       ("Test", "test@example.com", self.scope["hash_password"]("oldpass"), datetime.now().isoformat()))

    def request_link(self):
        self.scope["forgot_password"](self.scope["ForgotPasswordRequest"](email="test@example.com"))
        return self.mail.call_args.args[2].split("token=")[1]

    def test_reset_password_and_single_use(self):
        token = self.request_link()
        payload = self.scope["ResetPasswordRequest"](token=token, new_password="newpass")
        self.scope["reset_password"](payload)
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db, db:
            hashed = db.execute("SELECT password_hash FROM users").fetchone()[0]
        self.assertTrue(self.scope["pwd_context"].verify("newpass", hashed))
        with self.assertRaises(HTTPException):
            self.scope["reset_password"](payload)

    def test_registration_returns_recovery_code(self):
        result = self.scope["register"](self.scope["RegisterRequest"](name="New", email="dummy@example.com", password="password"))
        self.assertEqual(len(result["recovery_code"].replace("-", "")), 32)
        self.recover("dummy@example.com", result["recovery_code"])

    def recover(self, email, code, password="newpass"):
        return self.scope["recover_password"](self.scope["RecoverPasswordRequest"](email=email, recovery_code=code, new_password=password))

    def generate(self, password="oldpass"):
        return self.scope["generate_recovery_code"](self.scope["RecoveryCodeRequest"](current_password=password), current_user={"id": 1})["recovery_code"]

    def test_recovery_rotates_code_and_changes_password(self):
        code = self.generate()
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db:
            stored = db.execute("SELECT code_hash FROM recovery_codes").fetchone()[0]
        self.assertNotEqual(code, stored)
        result = self.recover(" TEST@example.com ", code.lower().replace("-", " "))
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db:
            hashed = db.execute("SELECT password_hash FROM users").fetchone()[0]
        self.assertTrue(self.scope["pwd_context"].verify("newpass", hashed))
        with self.assertRaises(HTTPException):
            self.recover("test@example.com", code)
        self.recover("test@example.com", result["recovery_code"])

    def test_recovery_rejects_wrong_code_user_and_password(self):
        code = self.generate()
        for email, candidate, password in [("test@example.com", "wrong", "newpass"), ("other@example.com", code, "newpass"), ("test@example.com", code, "short")]:
            with self.assertRaises(HTTPException):
                self.recover(email, candidate, password)
        with self.assertRaises(HTTPException):
            self.generate("wrong")
        self.recover("test@example.com", code)

    def test_regeneration_invalidates_previous_code(self):
        previous = self.generate()
        current = self.generate()
        with self.assertRaises(HTTPException):
            self.recover("test@example.com", previous)
        self.recover("test@example.com", current)

    def test_expired_and_superseded_links(self):
        old = self.request_link()
        new = self.request_link()
        with self.assertRaises(HTTPException):
            self.scope["reset_password"](self.scope["ResetPasswordRequest"](token=old, new_password="newpass"))
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db, db:
            db.execute("UPDATE password_reset_tokens SET expires_at=? WHERE token=?", ((datetime.utcnow()-timedelta(minutes=1)).isoformat(), new))
        with self.assertRaises(HTTPException):
            self.scope["reset_password"](self.scope["ResetPasswordRequest"](token=new, new_password="newpass"))

    def test_invalid_reset_requests(self):
        for token, password in [("", "newpass"), ("unknown", "newpass"), ("unknown", "short")]:
            with self.subTest(token=token, password=password), self.assertRaises(HTTPException):
                self.scope["reset_password"](self.scope["ResetPasswordRequest"](token=token, new_password=password))

    def test_unknown_email_and_failed_delivery(self):
        response = self.scope["forgot_password"](self.scope["ForgotPasswordRequest"](email="unknown@example.com"))
        self.assertIn("If an account exists", response["message"])
        self.mail.assert_not_called()
        self.mail.side_effect = RuntimeError("SMTP unavailable")
        with self.assertRaises(HTTPException):
            self.request_link()
        with closing(sqlite3.connect(self.scope["DATABASE_FILE"])) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM password_reset_tokens WHERE used=0").fetchone()[0], 0)

    def upload(self, text, filename="dataset.csv"):
        file = UploadFile(filename=filename, file=io.BytesIO(text.encode()))
        return asyncio.run(self.scope["upload_dataset"](file=file, current_user={}))

    def test_valid_upload_sorted_and_reset(self):
        result = self.upload("unit,cycle,sensor_2\n1,2,642\n1,1,641\n")
        self.assertEqual(result["rows"], 2)
        data = pd.read_csv(self.scope["STATE"]["data_file"])
        self.assertEqual(data.cycle.tolist(), [1, 2])
        self.assertEqual(data.RUL.tolist(), [1, 0])
        self.scope["reset_dataset"](current_user={})
        self.assertEqual(self.scope["STATE"]["data_file"], "default.csv")

    def test_raw_upload(self):
        result = self.upload(" ".join(["1", "1"] + ["0"] * 24), "raw.txt")
        self.assertEqual(result["engines"], 1)

    def test_invalid_uploads_do_not_activate(self):
        for text in ["", "unit,cycle\n1,1", "unit,cycle,sensor_2\n", "unit,cycle,sensor_2\n1,1,NaN", "unit,cycle,sensor_2\n1,1,640\n1,1,641", "unit,cycle,sensor_2\n1,-1,640", "unit,cycle,sensor_2\n1,1,abc"]:
            with self.subTest(text=text), self.assertRaises(HTTPException):
                self.upload(text)
            self.assertEqual(self.scope["STATE"]["data_file"], "default.csv")

    def test_upload_limits(self):
        for text, filename in [("unit,cycle,sensor_2\n1,1,640", "data.json"), ("x" * (20 * 1024 * 1024 + 1), "large.csv")]:
            with self.subTest(filename=filename), self.assertRaises(HTTPException):
                self.upload(text, filename)


if __name__ == "__main__":
    unittest.main()

