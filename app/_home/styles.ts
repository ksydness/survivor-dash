// Homepage stylesheet, scoped under .home and rendered by app/page.tsx only (same approach as the
// dashboard's dash/styles.ts). Colors are the Fantasy Survivor design-system tokens.
export const HOME_CSS = `
.home{--bg:#0c0a09;--panel:#1c1917;--panel2:#262220;--line:#2f2a27;--text:#fafaf9;--soft:#d6d3d1;--muted:#a8a29e;--faint:#78716c;
  --accent:#f59e0b;--accent2:#f97316;--gold:#fcd34d;--neg:#f87171;--pos:#4ade80;
  max-width:560px;margin:0 auto;padding-bottom:40px;color:var(--text)}
.home a{color:inherit;text-decoration:none}
.home .num{font-variant-numeric:tabular-nums}
.home .bar{display:flex;align-items:center;gap:8px;height:56px;padding:0 6px 0 16px;border-bottom:1px solid var(--line)}
.home .bar .torch{font-size:20px;line-height:1}
.home .bar h1{flex:1;margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.home .iconbtn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:999px;color:var(--soft)}
.home .iconbtn:hover{background:var(--panel)}
.home main{padding:16px 16px 0;display:flex;flex-direction:column;gap:16px}
.home .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px 16px 16px}
.home .eyebrow{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.home .hrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px}
.home .pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:rgba(245,158,11,.14);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.home .pill i{width:7px;height:7px;border-radius:999px;background:var(--accent)}
.home .pill.done{background:var(--panel2);color:var(--muted)}
.home .pill.done i{background:var(--faint)}
.home .headline{font-size:21px;font-weight:800;margin:10px 0 0;line-height:1.25;letter-spacing:-.01em;padding:0 2px}
.home .lede{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--soft);padding:0 2px}
.home .rows{display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--line)}
.home .row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:52px;padding:5px 2px;border-bottom:1px solid var(--line)}
.home a.row:hover{background:rgba(255,255,255,.02)}
.home .rk{display:flex;flex-direction:column;align-items:center;gap:2px}
.home .rk b{font-size:15px;font-weight:800}
.home .rk b.first{color:var(--gold)}
.home .mv{font-size:10px;font-weight:700;color:var(--faint)}
.home .mv.up{color:var(--pos)}.home .mv.down{color:var(--neg)}
.home .who{display:flex;flex-direction:column;gap:4px;min-width:0}
.home .tn{display:flex;align-items:center;gap:8px;min-width:0;font-size:15px;font-weight:700}
.home .tn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home .dot{flex:none;width:10px;height:10px;border-radius:999px}
.home .sub{display:flex;align-items:center;gap:8px;padding-left:18px;font-size:12px;color:var(--muted)}
.home .pips{display:inline-flex;gap:3px}
.home .pip{width:8px;height:8px;border-radius:999px;box-sizing:border-box;border:1.5px solid #57534e}
.home .pts{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.home .pts b{font-size:19px;font-weight:800}
.home .pts span{font-size:12px;color:var(--muted)}
.home .pts span.neg{color:var(--neg)}
.home .chips{display:flex;flex-wrap:wrap;gap:6px;padding-left:18px}
.home .chip{font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;border:1px solid var(--line)}
.home .clock{flex:none;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1c1917;background:var(--accent);border-radius:999px;padding:3px 8px}
.home .drow{display:flex;flex-direction:column;gap:6px;padding:10px 2px;border-bottom:1px solid var(--line)}
.home .drow .tn{font-size:15px}
.home .drow .count{flex:none;font-size:12px;color:var(--muted);font-weight:500}
.home .cta{display:flex;align-items:center;justify-content:center;gap:6px;height:52px;margin-top:14px;border-radius:14px;background:linear-gradient(90deg,var(--accent),var(--accent2));color:#1c1917!important;font-size:16px;font-weight:800}
.home .cta:hover{filter:brightness(1.06)}
.home .after{margin:14px 0 0;font-size:14px;line-height:1.5;color:var(--soft);padding:0 2px}
.home .facts{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;margin-top:8px;padding:0 2px;font-size:13px;color:var(--muted)}
.home .facts b{color:var(--text)}
.home .notify{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px 14px 14px 16px}
.home .notify .bell{flex:none;width:40px;height:40px;border-radius:12px;background:var(--panel2);display:flex;align-items:center;justify-content:center;color:var(--accent)}
.home .notify .txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.home .notify .txt b{font-size:15px}
.home .notify .txt span{font-size:13px;color:var(--muted);line-height:1.4}
.home .notify button{flex:none;height:44px;padding:0 16px;border-radius:999px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1px solid transparent}
.home .notify button.go{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#1c1917}
.home .notify button.off{background:var(--panel2);border-color:var(--line);color:var(--soft)}
.home .notify button:disabled{opacity:.6;cursor:default}
.home .titles{padding:18px 16px 8px}
.home .titles .hrow{align-items:baseline;padding:0}
.home .titles .hrow a{font-size:13px;font-weight:600;color:var(--muted)}
.home .titles .hrow a:hover{color:var(--accent)}
.home .trow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:48px;border-bottom:1px solid var(--line)}
.home .trow:last-child{border-bottom:0}
.home .trow .won{font-size:12px;color:var(--muted);padding-left:18px}
.home .cups{display:flex;gap:4px;color:var(--gold)}
.home .past h2{margin:8px 2px 10px}
.home .plist{display:flex;flex-direction:column;gap:8px}
.home .prow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:64px;padding:10px 14px 10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:14px}
.home .prow:hover{border-color:#44403c}
.home .sn{display:flex;flex-direction:column;align-items:center;line-height:1.1}
.home .sn span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.home .sn b{font-size:19px;font-weight:800}
.home .pc{display:flex;flex-direction:column;gap:3px;min-width:0}
.home .pc .tn svg{flex:none}
.home .pc .meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.home .pc .meta .dot{width:8px;height:8px}
.home .chev{color:var(--faint)}
.home .msg{color:var(--faint);text-align:center;padding:24px 8px}
.home .msg.err{color:var(--neg);font-size:13px}
.home .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
