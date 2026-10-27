const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "../work/guest-site");
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(__dirname, "../dist/assets"), path.join(target, "assets"), {
  recursive: true,
});
fs.copyFileSync(
  path.join(__dirname, "../dist/guest.html"),
  path.join(target, "guest.html"),
);
fs.writeFileSync(path.join(target, ".nojekyll"), "");
fs.writeFileSync(
  path.join(target, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>X-treem Studio</title><style>body{margin:0;background:#101820;color:#eef2ed;font:18px/1.7 system-ui,sans-serif}main{max-width:800px;margin:14vh auto;padding:30px}h1{font-size:64px;line-height:1.1;letter-spacing:-3px}span{color:#b5f060}a{color:#b5f060}p{color:#a9b8c0}.button{display:inline-block;padding:12px 24px;background:#b5f060;color:#15220c;border-radius:9px;text-decoration:none;font-weight:650}.small{font-size:14px}</style></head><body><main><p>X-TREEM STUDIO · WINDOWS DESKTOP</p><h1>Your story.<br>Every <span>screen.</span></h1><p>Stream landscape and portrait to multiple destinations at once. Invite a guest, bring comments on screen, change your background, and record the conversation.</p><a class="button" href="https://github.com/xunaidlnt-sudo/X-treem/releases/tag/v0.1.0">Download Windows preview</a><p class="small">Joining an interview? Open the private invitation link shared by your host.</p><p class="small"><a href="https://github.com/xunaidlnt-sudo/X-treem">Source, setup instructions and feature support</a></p></main></body></html>`,
);
