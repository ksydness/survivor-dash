// Dashboard stylesheet. Rendered in a <style> tag by the dashboard only (so nothing leaks into the
// draft room, which shares this route). Colors are the Fantasy Survivor design-system tokens.
export const CSS = `
.dash{--bg:#0c0a09;--panel:#1c1917;--sunk:#1f1b19;--panel2:#262220;--line:#2f2a27;--line2:#3a342f;
  --text:#fafaf9;--soft:#d6d3d1;--muted:#a8a29e;--faint:#78716c;--dim:#57534e;--disabled:#44403c;
  --accent:#f59e0b;--accent2:#f97316;--gold:#fcd34d;--neg:#f87171;--pos:#4ade80;
  --grad:linear-gradient(90deg,var(--accent),var(--accent2));
  color:var(--text);min-height:100vh;padding-bottom:48px}
.dash *{box-sizing:border-box}
.dash button{font:inherit;color:inherit}
.dash :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.dash .wrap{max-width:720px;margin:0 auto;padding:0 16px}
.dash .num{font-variant-numeric:tabular-nums}
.dash .muted{color:var(--muted)}
.dash .neg{color:var(--neg)}
.dash .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* app bar */
.dash .appbar{display:flex;align-items:center;gap:2px;height:56px;padding:0 6px;border-bottom:1px solid var(--line);max-width:720px;margin:0 auto}
.dash .iconbtn{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:999px;background:none;border:0;color:var(--soft);cursor:pointer;text-decoration:none}
.dash .iconbtn:hover{background:var(--panel)}
.dash .iconbtn:disabled{opacity:.5;cursor:default}
.dash .iconbtn.on{color:var(--accent)}
.dash .iconbtn.spin svg{animation:dspin 1s linear infinite}
@keyframes dspin{to{transform:rotate(360deg)}}
.dash .brand{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.dash .brand .torch{font-size:20px;line-height:1}
.dash .brand h1{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash .hint{margin:8px auto 0;max-width:420px;font-size:12px;color:var(--muted);line-height:1.45;text-align:center;padding:0 16px}

/* week bar */
.dash .weekbar{display:flex;align-items:center;height:48px;padding:0 2px;margin-top:12px;background:var(--panel);border:1px solid var(--line);border-radius:999px}
.dash .weekbar.past{border-color:var(--accent)}
.dash .weekbar .iconbtn{color:var(--text)}
.dash .weekbar .iconbtn:disabled{color:var(--disabled);opacity:1}
.dash .weekbar .lbl{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:700;text-align:center}
.dash .weekbar.past .lbl{color:var(--gold)}
.dash .live{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.dash .live::before{content:"";width:7px;height:7px;border-radius:999px;background:var(--accent)}
.dash .latest{display:block;margin:6px auto 0;background:none;border:0;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;padding:6px 10px}
.dash .latest:hover{color:var(--text)}

/* tabs */
.dash .tabsbar{position:sticky;top:0;z-index:20;background:var(--bg);margin:12px -16px 0;padding:6px 0}
.dash .tabs{display:flex;gap:6px;overflow-x:auto;padding:0 16px;scrollbar-width:none}
.dash .tabs::-webkit-scrollbar{display:none}
.dash .tab{flex:none;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--soft);font-size:14px;font-weight:700;cursor:pointer}
.dash .tab[aria-current="page"]{background:var(--grad);color:var(--panel);border-color:transparent}
.dash main{display:flex;flex-direction:column;gap:16px;margin-top:12px}

/* panels */
.dash .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
.dash .ph{margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .phrow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
.dash .phrow .aside{font-size:12px;color:var(--muted)}
.dash .sub{margin:4px 0 12px;font-size:13px;color:var(--muted)}
.dash .note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.45}
.dash .sectionlabel{margin:6px 0 -4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .empty{background:var(--panel);border:1px dashed var(--line2);border-radius:16px;padding:18px;font-size:14px;color:var(--muted);text-align:center}

/* disclosure ("dig deeper") */
.dash .disc{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.dash .disc>button{width:100%;display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 16px;background:none;border:0;text-align:left;cursor:pointer}
.dash .disc .dt{flex:1;min-width:0}
.dash .disc .dt b{display:block;font-size:15px;font-weight:800}
.dash .disc .dt span{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.dash .disc .act{font-size:13px;color:var(--muted);font-weight:600}
.dash .disc .body{padding:0 16px 16px}

/* segmented + chips */
.dash .seg{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:3px}
.dash .seg button{height:38px;border:0;border-radius:999px;background:transparent;color:var(--soft);font-size:14px;font-weight:700;cursor:pointer}
.dash .seg button[aria-pressed="true"]{background:var(--text);color:var(--panel)}
.dash .chips{display:flex;gap:8px;overflow-x:auto;margin:0 -16px;padding:0 16px;scrollbar-width:none}
.dash .chips::-webkit-scrollbar{display:none}
.dash .chip{flex:none;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--soft);font-size:13px;font-weight:700;cursor:pointer}
.dash .chip[aria-pressed="true"]{border-color:var(--soft);background:var(--panel2);color:var(--text)}
.dash .dot{width:10px;height:10px;border-radius:3px;flex:none;display:inline-block}
.dash .dot.lg{width:12px;height:12px;border-radius:4px}
.dash .legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin-top:12px;font-size:13px;color:var(--soft)}
.dash .legend div{display:flex;align-items:center;gap:7px}

/* week recap */
.dash .recap h3{margin:8px 0 0;font-size:20px;font-weight:800;line-height:1.25;letter-spacing:-.01em}
.dash .recap p{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--soft)}
.dash .minis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
.dash .mini{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px;min-width:0}
.dash .mini .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .mini .v{display:flex;align-items:center;gap:6px;font-size:16px;font-weight:800;margin-top:4px;line-height:1.25}
.dash .mini .d{font-size:12px;color:var(--muted);margin-top:2px}

/* standings */
.dash .stands{display:grid;gap:10px}
.dash .stand{background:var(--panel2);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.dash .stand>button{width:100%;display:grid;grid-template-columns:36px minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:14px 14px 14px 10px;background:none;border:0;text-align:left;cursor:pointer}
.dash .stand .rk{text-align:center}
.dash .stand .rk b{display:block;font-size:22px;font-weight:800;line-height:1;color:var(--muted)}
.dash .stand.win .rk b{color:var(--gold)}
.dash .stand .rk b.tie{font-size:15px}
.dash .stand .mv{display:block;font-size:12px;font-weight:700;margin-top:5px;color:var(--muted)}
.dash .stand .mv.up{color:var(--pos)}.dash .stand .mv.down{color:var(--neg)}
.dash .stand .tn{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;line-height:1.25}
.dash .stand .track{display:block;height:6px;background:var(--panel);border-radius:6px;margin-top:9px;overflow:hidden}
.dash .stand .track i{display:block;height:100%;border-radius:6px}
.dash .stand .meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;font-size:12px;color:var(--muted);font-weight:600}
.dash .stand .meta .neg{color:var(--neg)}
.dash .pips{display:flex;gap:3px;flex:none}
.dash .pip{width:8px;height:8px;border-radius:999px;border:1.5px solid}
.dash .stand .pts{text-align:right}
.dash .stand .pts b{display:block;font-size:22px;font-weight:800;line-height:1}
.dash .stand .pts span{display:block;font-size:12px;font-weight:700;margin-top:6px;color:var(--muted)}
.dash .stand .pts span.lead{color:var(--gold)}
.dash .stand .expand{background:var(--sunk);border-top:1px solid var(--line);padding:12px 14px 4px}
.dash .colhead{display:flex;gap:10px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px}
.dash .colhead span:first-child{flex:1}
.dash .roster{display:grid;gap:9px}
.dash .player{display:flex;align-items:center;gap:10px;font-size:14px}
.dash .player .pn{width:92px;flex:none;font-weight:600;overflow-wrap:anywhere}
.dash .player .pn small{display:block;font-size:11px;font-weight:500;color:var(--muted)}
.dash .player.out .pn{color:var(--muted)}
.dash .player .bar{flex:1;height:8px;background:var(--panel2);border-radius:6px;overflow:hidden}
.dash .player .bar i{display:block;height:100%;border-radius:6px}
.dash .player .wk{width:40px;text-align:right;font-size:12px;color:var(--muted)}
.dash .player .wk.neg{color:var(--neg)}
.dash .player .tot{width:36px;text-align:right;font-weight:700}
.dash .teamlink{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;margin-top:12px;border:0;border-top:1px solid var(--line);background:none;color:var(--soft);font-size:14px;font-weight:700;cursor:pointer;padding:0}
.dash .teamlink span{font-size:13px;color:var(--muted);font-weight:600}

/* highlights (week-by-week list) */
.dash .hls{display:grid;gap:8px}
.dash .hl{display:flex;gap:12px;padding:12px 14px;background:var(--panel2);border:1px solid var(--line);border-radius:12px}
.dash .hl .wkb{flex:none;width:46px;font-weight:800;font-size:13px}
.dash .hl .hlb{flex:1;display:grid;gap:5px;font-size:14px;min-width:0}
.dash .hl .ln{display:flex;gap:8px;align-items:baseline}
.dash .hl .lbl{flex:none;width:38px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.dash .hl .names{display:inline-flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.dash .hl .outn{color:var(--neg);font-weight:600}
.dash .tiebtn{background:none;border:1px solid var(--line2);border-radius:999px;padding:2px 10px;font-size:13px;font-weight:600;cursor:pointer}

/* teams tab */
.dash .glance{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:8px}
.dash .gl{background:var(--panel);border:1px solid var(--line);border-top-width:4px;border-radius:14px;padding:12px 6px 10px;text-align:center;min-width:0}
.dash .gl b{display:block;font-size:26px;font-weight:800;line-height:1}
.dash .gl b small{font-size:14px;color:var(--muted);font-weight:700}
.dash .gl span{display:block;font-size:11px;font-weight:700;color:var(--soft);margin-top:6px;line-height:1.25;overflow-wrap:anywhere}
.dash .search label{display:block;margin-bottom:8px}
.dash .search .box{position:relative}
.dash .search svg{position:absolute;left:14px;top:13px}
.dash .search input{width:100%;height:44px;padding:0 14px 0 40px;background:var(--panel);border:1px solid var(--line2);border-radius:12px;color:var(--text);font:inherit;font-size:16px}
.dash .search input::placeholder{color:var(--muted)}
.dash .result{margin-top:8px;display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;font-size:14px}
.dash .tc-head{display:flex;align-items:center;gap:10px}
.dash .tc-head h2{margin:0;flex:1;font-size:17px;font-weight:800;line-height:1.25}
.dash .tc-head span{font-size:13px;color:var(--muted);font-weight:600;white-space:nowrap}
.dash .rchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.dash .rchip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;background:var(--panel2);border:1px solid}
.dash .rchip.out{background:transparent;border-style:dashed;border-color:var(--line2);color:var(--muted)}
.dash .rchip.out s{text-decoration-thickness:1px}
.dash .rchip small{font-size:11px;font-weight:600;color:var(--muted)}
.dash .rchip.hit{outline:2px solid var(--text);outline-offset:1px}
.dash .rchip[aria-pressed="true"]{color:var(--panel)}
.dash .rchip[aria-pressed="true"] small{color:var(--panel)}
.dash .moretoggle{width:100%;display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-top:12px;padding:0 2px;background:none;border:0;border-top:1px solid var(--line);color:var(--soft);font-size:14px;font-weight:700;cursor:pointer}
.dash .moretoggle span{font-size:13px;color:var(--muted);font-weight:600}
.dash .h3{margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .share{display:flex;height:18px;border-radius:999px;overflow:hidden;background:var(--panel2)}
.dash .share i{height:100%;border-right:2px solid var(--panel)}
.dash .sharelist{display:grid;gap:7px;margin-top:10px}
.dash .sharelist div{display:flex;align-items:center;gap:10px;font-size:14px}
.dash .sharelist .n{flex:1;font-weight:600}
.dash .sharelist .pct{width:40px;text-align:right;color:var(--muted);font-size:13px}
.dash .sharelist .v{width:36px;text-align:right;font-weight:800}

/* player card */
.dash .pcard{margin-top:12px;background:var(--panel2);border:1px solid var(--line2);border-radius:16px;padding:14px}
.dash .pcard .top{display:flex;align-items:center;gap:12px}
.dash .avatar{width:48px;height:48px;flex:none;border-radius:999px;background:var(--panel);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;border:3px solid}
.dash .pcard .who{flex:1;min-width:0}
.dash .pcard .who b{display:block;font-size:19px;font-weight:800;line-height:1.2}
.dash .pcard .who span{display:block;font-size:13px;color:var(--muted);margin-top:2px}
.dash .ptiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.dash .ptiles div{background:var(--panel);border-radius:12px;padding:10px 6px;text-align:center}
.dash .ptiles b{display:block;font-size:20px;font-weight:800;line-height:1}
.dash .ptiles span{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-top:5px}

/* small bar charts */
.dash .bars{display:flex;align-items:flex-end;gap:4px;border-bottom:1px solid var(--line2);margin-top:14px}
.dash .bars i{flex:1;max-width:24px;border-radius:3px 3px 0 0;min-height:2px}
.dash .barlbl{display:flex;gap:4px;margin-top:4px}
.dash .barlbl span{flex:1;max-width:24px;text-align:center;font-size:10px;color:var(--muted)}
.dash .ends{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px}

/* contestants */
.dash .clist{display:grid;gap:6px}
.dash .crow{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.dash .crow>button{width:100%;display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 14px;background:none;border:0;text-align:left;cursor:pointer}
.dash .crow .nm{flex:1;min-width:0}
.dash .crow .nm b{display:block;font-size:15px;font-weight:700}
.dash .crow .nm span{display:block;font-size:12px;color:var(--muted);margin-top:1px}
.dash .crow .wk{font-size:12px;color:var(--muted)}
.dash .crow .wk.neg{color:var(--neg)}
.dash .crow .tot{width:40px;text-align:right;font-size:18px;font-weight:800}
.dash .crow .chev{width:12px;text-align:center;color:var(--muted);font-size:12px}
.dash .crow .body{border-top:1px solid var(--line);background:var(--panel2);padding:14px}
.dash .crow.out>button{min-height:48px}
.dash .crow.out .nm b{font-weight:600;color:var(--soft)}
.dash .outtoggle{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 16px;background:var(--panel);border:1px solid var(--line);border-radius:14px;font-size:14px;font-weight:700;cursor:pointer}
.dash .outtoggle span{font-size:13px;color:var(--muted);font-weight:600}

/* draft */
.dash .dgrid{display:grid;grid-template-columns:26px repeat(var(--n,4),minmax(0,1fr));gap:4px}
.dash .dhead{font-size:11px;font-weight:800;line-height:1.2;padding:0 2px 6px;border-bottom:3px solid;display:flex;align-items:flex-end;overflow-wrap:anywhere}
.dash .dround{display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--soft)}
.dash .dround span{font-size:12px;color:var(--muted);font-weight:600}
.dash .dcell{min-width:0;padding:6px 5px 6px 6px;border:0;border-left:3px solid;border-radius:8px;text-align:left;cursor:pointer}
.dash .dcell[aria-pressed="true"]{outline:2px solid var(--text);outline-offset:-2px}
.dash .dcell.out{opacity:.6}
.dash .dcell.out .dn{text-decoration:line-through}
.dash .dcell .dno{display:block;font-size:10px;font-weight:700;color:var(--muted)}
.dash .dcell .dn{display:block;font-size:12.5px;font-weight:800;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .dcell .dp{display:block;font-size:11px;color:var(--soft);margin-top:1px}
.dash .dcell.empty{background:none;cursor:default}
.dash .dcell.empty .dn{color:var(--dim)}
.dash .readout{margin-top:12px;padding:10px 12px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;font-size:14px;line-height:1.4}
.dash .scatter{display:flex;gap:6px}
.dash .scatter .yax{position:relative;width:28px;height:220px;font-size:10px;color:var(--muted)}
.dash .scatter .yax span{position:absolute;right:0;transform:translateY(50%)}
.dash .scatter .plot{position:relative;flex:1;height:220px;border-left:1px solid var(--line2);border-bottom:1px solid var(--line2)}
.dash .scatter .gl-h{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
.dash .scatter .gl-v{position:absolute;top:0;bottom:0;border-left:1px dashed var(--line)}
.dash .scatter .pt{position:absolute;width:24px;height:24px;margin:0 0 -12px -12px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center}
.dash .scatter .pt i{width:11px;height:11px;border-radius:999px}
.dash .scatter .pt[aria-pressed="true"] i{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--text)}
.dash .xax{display:flex;margin:6px 0 0 34px;font-size:10px;color:var(--muted)}
.dash .xax span{flex:1;text-align:center}

/* stats */
.dash .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.dash .tile{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;min-width:0}
.dash .tile .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .tile .v{font-size:22px;font-weight:800;margin-top:6px;line-height:1.15;overflow-wrap:anywhere}
.dash .tile .v.sm{font-size:18px}
.dash .tile .v small{font-size:14px;color:var(--muted);font-weight:700}
.dash .tile .d{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.35}
.dash .heatrow{display:grid;grid-template-columns:72px repeat(var(--w,13),minmax(0,1fr));gap:2px;align-items:center}
.dash .heatrow .hn{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;overflow:hidden;white-space:nowrap}
.dash .heatrow .hn i{width:6px;height:12px;border-radius:2px;flex:none}
.dash .heatrow .hn.out{color:var(--muted)}
.dash .heatrow .hw{text-align:center;font-size:9px;color:var(--muted)}
.dash .hc{height:18px;padding:0;border:0;border-radius:3px;cursor:pointer}
.dash .hc[aria-pressed="true"]{outline:2px solid var(--text);outline-offset:-1px}
.dash .heatkey{display:flex;align-items:center;gap:6px;margin-top:14px;font-size:11px;color:var(--muted);flex-wrap:wrap}
.dash .heatkey i{width:14px;height:14px;border-radius:3px}
.dash .stack{display:flex;align-items:flex-end;gap:4px;height:160px;border-bottom:1px solid var(--line2)}
.dash .stack .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.dash .stack .col span{text-align:center;font-size:9px;font-weight:700;color:var(--soft);margin-bottom:3px}
.dash .stack .col div{display:flex;flex-direction:column-reverse;gap:1px}
.dash .stack .col i{display:block}
.dash .rows{display:grid;font-size:14px}
.dash .rows>div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.dash .rows>div:last-child{border-bottom:0}
.dash .rows>div>span{color:var(--soft)}
.dash .rows b{text-align:right}

/* history */
.dash .champ{display:flex;align-items:center;gap:14px}
.dash .champ .cup{width:48px;height:48px;flex:none;border-radius:999px;background:var(--panel2);border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;color:var(--gold)}
.dash .champ .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.dash .champ .v{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:800;margin-top:3px}
.dash .champ .d{font-size:12px;color:var(--muted);margin-top:2px}
.dash .titles>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.dash .titles>div:last-child{border-bottom:0;padding-bottom:2px}
.dash .titles .tn{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800}
.dash .titles .cups{display:flex;gap:4px;color:var(--gold)}
.dash .titles .cups .none{font-size:12px;color:var(--muted)}
.dash .titles .d{font-size:12px;color:var(--muted)}
.dash .season{margin-bottom:14px}
.dash .season:last-child{margin-bottom:0}
.dash .season>b{display:block;font-size:12px;font-weight:800;color:var(--soft);margin-bottom:4px}
.dash .season div{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}
.dash .season div .pl{width:18px;font-weight:800;color:var(--muted)}
.dash .season div .pl.w{color:var(--gold)}
.dash .season div .t{flex:1;font-weight:600}
.dash .season div .p{font-weight:800}
.dash .strip{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:14px}
.dash .strip>span{font-size:12px;font-weight:700;color:var(--soft)}
.dash .strip .line{position:relative;height:20px;border-bottom:1px solid var(--line)}
.dash .strip .line i{position:absolute;bottom:4px;width:12px;height:12px;margin-left:-6px;border-radius:999px;border:2px solid var(--panel)}
.dash .strip .line i.w{border-color:var(--gold)}
.dash .strip .axis{position:relative;height:14px;font-size:10px;color:var(--muted)}
.dash .strip .axis span{position:absolute;transform:translateX(-50%)}

/* loading */
.dash .skel{background:var(--panel);border:1px solid var(--line);border-radius:16px;height:120px;animation:dpulse 1.4s ease-in-out infinite}
@keyframes dpulse{50%{opacity:.5}}
@media (prefers-reduced-motion: reduce){.dash .skel,.dash .iconbtn.spin svg{animation:none}}
`;
