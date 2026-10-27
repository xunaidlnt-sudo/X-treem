function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? line + " " + word : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else line = trial;
  }
  if (lines.length < maxLines) lines.push(line);
  if (lines.join(" ").length < text.length)
    lines[lines.length - 1] = lines.at(-1).slice(0, 65) + "…";
  return lines;
}
export function drawComment(ctx, m, w, h, accent) {
  if (!m) return;
  const p = h > w,
    x = w * 0.04,
    width = w * 0.92,
    boxHeight = h * (p ? 0.16 : 0.23),
    y = h * 0.69;
  ctx.save();
  ctx.fillStyle = m.kind === "paid" ? "#184b49" : "rgba(12,17,24,.94)";
  ctx.fillRect(x, y, width, boxHeight);
  ctx.fillStyle = m.kind === "paid" ? "#59dfcb" : accent;
  ctx.fillRect(x, y, 6, boxHeight);
  ctx.textAlign = "left";
  ctx.font = `bold ${h * (p ? 0.019 : 0.028)}px Arial`;
  ctx.fillStyle = m.kind === "paid" ? "#83f2d8" : accent;
  const heading = `${m.sample ? "SAMPLE · " : ""}${m.author}${m.amount ? " · " + m.amount : ""}  /  ${m.platform}`;
  ctx.fillText(heading, x + w * 0.025, y + h * 0.04, width - w * 0.05);
  ctx.fillStyle = "#fff";
  ctx.font = `${h * (p ? 0.024 : 0.037)}px Arial`;
  const lines = wrap(ctx, m.text, width - w * 0.06, 3);
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      x + w * 0.025,
      y + h * (p ? 0.078 : 0.095) + i * h * (p ? 0.029 : 0.045),
      width - w * 0.06,
    ),
  );
  ctx.restore();
}
export function drawReactions(ctx, reactions, w, h) {
  const now = performance.now();
  for (const r of reactions) {
    const progress = (now - r.at) / 3500;
    if (progress < 0 || progress > 1) continue;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.font = `${Math.min(w, h) * 0.075}px "Segoe UI Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      r.emoji,
      w * (0.16 + r.seed * 0.7) + Math.sin(progress * 7 + r.seed) * w * 0.03,
      h * (0.88 - progress * 0.65),
    );
    ctx.restore();
  }
}
