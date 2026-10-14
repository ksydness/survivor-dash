// Viewing-night page stylesheet, scoped under .vw (same approach as the homepage's _home/styles.ts).
// Colors are the Fantasy Survivor design-system tokens.
export const VW_CSS = `
.vw{--bg:#0c0a09;--panel:#1c1917;--sunk:#1f1b19;--panel2:#262220;--line:#2f2a27;--line2:#3a342f;--text:#fafaf9;--soft:#d6d3d1;--muted:#a8a29e;--faint:#78716c;--dim:#57534e;
  --accent:#f59e0b;--accent2:#f97316;--gold:#fcd34d;--neg:#f87171;
  max-width:560px;margin:0 auto;padding-bottom:48px;color:var(--text)}
.vw a{color:inherit;text-decoration:none}
.vw button{font:inherit;color:inherit;cursor:pointer}
.vw button:disabled{opacity:.55;cursor:default}
.vw .num{font-variant-numeric:tabular-nums}
.vw .bar{display:flex;align-items:center;gap:4px;height:56px;padding:0 6px 0 4px;border-bottom:1px solid var(--line)}
.vw .bar h1{flex:1;margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em}
.vw .iconbtn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:999px;color:var(--soft);background:none;border:0}
.vw .iconbtn:hover{background:var(--panel)}
.vw .iconbtn.on{color:var(--accent)}
.vw .hint{margin:8px auto 0;max-width:420px;font-size:12px;color:var(--muted);line-height:1.45;text-align:center;padding:0 16px}
.vw main{padding:16px 16px 0;display:flex;flex-direction:column;gap:14px}
.vw .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}
.vw .card.hi{border-color:var(--line2)}
.vw .eyebrow{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.vw .hrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.vw .pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:rgba(245,158,11,.14);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
.vw .pill i{width:7px;height:7px;border-radius:999px;background:var(--accent)}
.vw .pill.grey{background:var(--panel2);color:var(--soft)}
.vw h2.title{font-size:21px;font-weight:800;margin:10px 0 0;line-height:1.25;letter-spacing:-.01em}
.vw .lede{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--muted)}
.vw .lede b{color:var(--text)}
.vw .facts{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;margin-top:10px;font-size:13px;color:var(--muted)}
.vw .facts b{color:var(--text)}
.vw .note{font-size:12px;line-height:1.5;color:var(--muted);margin:0 2px}
.vw .err{background:rgba(248,113,113,.1);border:1px solid #5b2626;color:#fecaca;border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4}
.vw .flash{background:rgba(245,158,11,.1);border:1px solid #7c5a2b;color:var(--gold);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4}
.vw .cta{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:52px;border-radius:14px;border:0;background:linear-gradient(90deg,var(--accent),var(--accent2));color:#1c1917!important;font-size:16px;font-weight:800;padding:0 16px;text-align:center}
.vw .cta.sm{min-height:48px;font-size:15px}
.vw .ghost{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border-radius:14px;background:var(--panel2);border:1px solid var(--line2);color:var(--text);font-size:15px;font-weight:700;padding:0 14px;text-align:center}
.vw .dashed{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border-radius:14px;border:1.5px dashed var(--line2);background:none;color:var(--soft);font-size:15px;font-weight:700}
.vw .linkbtn{background:none;border:0;color:var(--muted);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;padding:8px 2px}
.vw .linkbtn.danger{color:var(--neg)}
.vw .row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.vw .who{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;border-radius:14px;background:var(--panel);border:1px solid var(--line)}
.vw .who .t{flex:1;font-size:14px;color:var(--soft)}
.vw .who .t b{color:var(--text)}
.vw .chipbtn{height:36px;padding:0 12px;border-radius:999px;background:var(--panel2);border:1px solid var(--line2);font-size:13px;font-weight:700}
.vw .dots{display:inline-flex;gap:4px}
.vw .dots i{width:10px;height:10px;border-radius:999px;border:1.5px solid var(--dim);box-sizing:border-box}
/* option cards */
.vw .opt{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.vw .opt.lead{border-color:var(--line2)}
.vw .opt .top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:14px 14px 0}
.vw .opt .d{display:flex;flex-direction:column;gap:2px;min-width:0}
.vw .opt .d b{font-size:16px;font-weight:800}
.vw .opt .d span{font-size:13px;color:var(--muted)}
.vw .opt .lead-tag{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin-left:8px}
.vw .opt .cnt{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:12px;font-weight:700;color:var(--muted)}
.vw .opt .cnt.clear{color:var(--text)}
.vw .ans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 14px 0}
.vw .ans button{height:44px;border-radius:12px;border:1.5px solid var(--line2);background:var(--panel2);color:var(--soft);font-size:15px;font-weight:800}
.vw .ans button.y{background:linear-gradient(90deg,var(--accent),var(--accent2));border-color:transparent;color:#1c1917}
.vw .ans button.m{background:rgba(252,211,77,.12);border-color:var(--gold);color:var(--gold)}
.vw .ans button.n{background:rgba(248,113,113,.12);border-color:var(--neg);color:var(--neg)}
.vw .split{display:flex;gap:8px;margin:10px 14px 0;padding:8px 10px;border-radius:10px;background:var(--panel2);font-size:13px;line-height:1.4;color:var(--soft)}
.vw .split b{color:var(--text)}
.vw .more{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;margin-top:8px;padding:0 14px;border:0;border-top:1px solid var(--line);background:none;color:var(--muted);font-size:13px;font-weight:700}
.vw .more svg{transition:transform .15s}
.vw .more[aria-expanded=true] svg{transform:rotate(180deg)}
.vw .tray{background:var(--sunk);border-top:1px solid var(--line);padding:4px 14px 12px}
.vw .tteam{padding:8px 0;border-bottom:1px solid var(--line)}
.vw .tteam:last-of-type{border-bottom:0}
.vw .tteam .th{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--muted)}
.vw .tteam .th em{margin-left:auto;font-style:normal;color:var(--text)}
.vw .tteam .ps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.vw .pchip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border-radius:999px;background:var(--panel2);font-size:13px}
.vw .pchip b{font-weight:800}
.vw .pchip small{font-size:11px;color:var(--muted)}
.vw .pchip.out{text-decoration:line-through;color:var(--muted)}
.vw .y{color:var(--text)}.vw .m{color:var(--gold)}.vw .n{color:var(--neg)}.vw .q{color:var(--muted)}
/* forms */
.vw .field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.vw input,.vw select{height:48px;border-radius:12px;border:1px solid var(--line2);background:var(--panel2);color:var(--text);font:inherit;font-size:16px;font-weight:600;letter-spacing:0;text-transform:none;padding:0 12px;color-scheme:dark;width:100%}
.vw select.chip{height:40px;width:auto;border-radius:999px;font-size:14px;font-weight:700;padding:0 10px}
.vw .chips{display:flex;flex-wrap:wrap;gap:8px}
.vw .tog{min-height:44px;padding:0 14px;border-radius:999px;border:1.5px solid var(--line2);background:var(--panel2);color:var(--soft);font-size:15px;font-weight:700;display:inline-flex;align-items:center;gap:8px}
.vw .tog[aria-pressed=true]{border-color:var(--accent);background:rgba(245,158,11,.12);color:var(--text)}
.vw .tog.out[aria-pressed=true]{border-color:var(--neg);background:rgba(248,113,113,.12);color:var(--neg)}
.vw .tog .ck{width:20px;height:20px;border-radius:999px;border:1.5px solid var(--faint);display:flex;align-items:center;justify-content:center;color:#1c1917}
.vw .tog[aria-pressed=true] .ck{background:var(--accent);border-color:var(--accent)}
.vw .stepper{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;border-radius:14px;background:var(--panel2)}
.vw .stepper span{flex:1;font-size:15px;font-weight:700}
.vw .stepper button{width:40px;height:40px;border-radius:10px;border:1px solid var(--line2);background:var(--panel);font-size:18px;font-weight:700}
.vw .stepper b{min-width:22px;text-align:center;font-size:18px;font-weight:800}
.vw .cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.vw .cal .h{text-align:center;font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--muted)}
.vw .cal button{position:relative;height:46px;border-radius:12px;border:1.5px solid var(--line2);background:var(--panel2);color:var(--text);font-size:15px;font-weight:600;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}
.vw .cal button small{font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.vw .cal button[aria-pressed=true]{background:linear-gradient(90deg,var(--accent),var(--accent2));border-color:transparent;color:#1c1917;font-weight:800}
.vw .cal button[aria-pressed=true] small{color:#1c1917}
.vw .cal button:disabled{background:none;border-color:transparent;color:var(--dim)}
.vw .cal button.has{box-shadow:inset 0 0 0 2px var(--gold)}
.vw .trow{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-bottom:1px solid var(--line)}
.vw .trow .ts{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.vw .trow:last-child{border-bottom:0}
.vw .trow > b{font-size:15px}
.vw .x{width:36px;height:36px;border-radius:999px;border:0;background:none;color:var(--muted);font-size:18px}
.vw .due{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.vw .due button{min-height:52px;border-radius:12px;border:1.5px solid var(--line2);background:var(--panel2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.vw .due button b{font-size:14px}
.vw .due button span{font-size:11px;color:var(--muted)}
.vw .due button[aria-pressed=true]{border-color:var(--accent);background:rgba(245,158,11,.12)}
/* locked */
.vw .when{display:flex;align-items:center;gap:14px;margin-top:14px}
.vw .tile{flex:none;width:60px;border-radius:14px;overflow:hidden;background:var(--panel2);text-align:center}
.vw .tile div{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#1c1917;font-size:11px;font-weight:800;letter-spacing:.08em;padding:3px 0}
.vw .tile b{display:block;font-size:26px;font-weight:800;padding:4px 0 6px}
.vw .when .big{font-size:22px;font-weight:800;letter-spacing:-.01em}
.vw .box{margin-top:14px;padding:14px;border-radius:14px;background:var(--panel2)}
.vw .box .t{font-size:15px;font-weight:700}
.vw .box .s{font-size:13px;color:var(--muted);margin-top:3px;line-height:1.4}
.vw .box .chips{margin-top:12px}
.vw .box .tog{background:var(--panel)}
.vw .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
