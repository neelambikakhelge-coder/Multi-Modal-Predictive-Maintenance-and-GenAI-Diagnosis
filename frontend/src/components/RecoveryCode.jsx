export default function RecoveryCode({ code }) {
  function download() {
    const url = URL.createObjectURL(new Blob([`AURA recovery code\n\n${code}\n\nKeep this private. Use it once to reset your password.\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "aura-recovery-code.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="recovery-code-box" role="status">
    <strong>Save your recovery code</strong>
    <p>Keep this code private. It is shown only now and can reset your password once.</p>
    <code style={{ display: "block", overflowWrap: "anywhere", marginBottom: 12 }}>{code}</code>
    <button type="button" className="settings-action" onClick={download}>Download recovery code</button>
  </div>;
}
