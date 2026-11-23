# AURA setup

Install backend dependencies with `pip install -r requirements.txt`, then start the API from the project directory with `uvicorn main:app --reload`. In `frontend`, run `npm install` and `npm run dev`.

## Account recovery (no email required)

Registration displays a private, downloadable recovery code. Save it before signing in. Existing users can open **Settings → Account recovery**, enter their current password, and generate a code. Generating a new code invalidates the previous one.

On **Forgot password**, enter the account email (dummy email addresses work), recovery code, and new password. Each code is usable once. After resetting, save the replacement code shown on screen. Codes are stored as hashes and cannot be retrieved later. If you lose both your password and recovery code, self-service recovery is unavailable.

Restart the backend after updating so it creates the recovery-code table for existing databases. No SMTP configuration is required for this flow.

## Legacy password reset email endpoints (optional)

Add these values to your local `.env` file using your email provider's SMTP credentials:

```dotenv
AUTH_SECRET_KEY=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USERNAME=your-email-address
SMTP_PASSWORD=your-provider-app-password
SMTP_FROM_EMAIL=your-email-address
SMTP_USE_TLS=true
```

Restart the backend after changing configuration. Password reset links expire after 30 minutes and can be used once. Requesting a new link invalidates previous links. Email delivery requires working SMTP credentials; the application does not expose reset tokens in the browser.

## Dataset upload

For testing multiple engines, use `sample_dataset_50_engines.csv`: 9,909 rows covering complete histories for engines 1–50, including Healthy, Warning and Critical labels. Select an engine from the top-bar selector after uploading. The earlier `sample_dataset.csv` and `sample_dataset_degradation.csv` contain only Engine 1. Uploading replaces the active engine list; it does not merge with the default dataset. Charts and predictions show the selected engine.

Open **Settings → Active dataset → Upload dataset**. Upload a UTF-8 `.csv` or `.txt` file up to 20 MB. Raw NASA C-MAPSS whitespace-delimited files must contain unit, cycle, three settings and 21 sensors. A CSV needs `unit`, `cycle`, and the 17 sensor columns used by the trained models (see `train_processed.csv`). Engine IDs and cycles must be positive integers with unique pairs; required numeric values must be finite.

The application sorts rows by engine and cycle. If absent, RUL is derived from each engine's final recorded cycle, assuming run-to-failure data; health labels are derived from RUL. For truncated test datasets, supply actual RUL values to avoid treating the final observation as failure. Uploads use the existing trained models, without retraining them.

The active dataset is shared by all signed-in users on the running backend and resets to the default after a backend restart. **Reset to default** restores FD001 immediately.
