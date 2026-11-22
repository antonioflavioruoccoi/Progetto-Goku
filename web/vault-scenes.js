const tiles = (columns, rows, tile) => Array.from({length:columns * rows}, (_, i) => tile(i % columns, Math.floor(i / columns), i)).join('');
const figure = '<path d="M-10 48 0 9 10 48M-14 9H14l4 25H-18Z"/><path d="M-8 10V-1H8v11M-6-6h12M-12 15l-9 20m33-20 9 20"/>';
const scenes = {
  'jenga-tower': {
    color:'#e9b47b',
    shapes:tiles(2, 5, (x,y,i) => `<g class="vault-piece" style="--i:${i};--x:${x ? 12 : -12}px" transform="translate(${111+x*46+(y%2)*14} ${31+y*28})"><path d="m0 10 21-10 59 0-21 10v18H0Z" fill="url(#vault-metal)"/><path d="M0 10h59l21-10v17L59 28m0-18v18M8 19h36" fill="none"/></g>`),
  },
  eiffel: {
    color:'#d5b69d',
    shapes:'<path fill="url(#vault-metal)" d="M155 12h10l4 54 13 46 26 60h-29q-19-46-38 0h-29l26-60 13-46Z"/><path d="M160 4v24m-24 84h48m-35-45h22m-49 82 58-35m18 36-58-36m5-21 27-25m4 30-25-31m5-16 11-16m-2 15-9-14"/><path class="vault-beam" fill="currentColor" stroke="none" d="m160 15 147-24v54Z"/>',
  },
  chemistry: {
    color:'#7af0d7',
    shapes:'<path fill="url(#vault-metal)" d="M99 57h43v9l-9 6v37l29 42q5 15-10 17H87q-15-2-10-17l32-42V72l-10-6Z"/><path fill="currentColor" fill-opacity=".32" d="M97 130q27-13 47 0l16 29-9 8H87l-9-8Z"/><path d="M181 72h33m-29 0v64a13 13 0 0 0 26 0V72m-25 46h24m24-30 15-14 17 14-5 21h-23Z"/><g class="vault-bubbles" fill="currentColor"><circle cx="119" cy="124" r="5"/><circle cx="132" cy="104" r="4"/><circle cx="199" cy="102" r="5"/><circle cx="116" cy="91" r="3"/></g>',
  },
  marathon: {
    color:'#ffd081',
    shapes:'<path opacity=".4" d="M35 146h250M16 155h276M7 168h283"/>' + tiles(3,1,(x) => `<g transform="translate(${102+x*58} ${103-x*12}) scale(${1-x*.13})"><g class="vault-runner" style="--i:${x}"><path d="m-24 11-18 1m17 7-36 4" opacity=".5"/><circle cy="-26" r="9" fill="currentColor"/><path stroke-width="7" d="m-5-11-12 25 23 8 13 24m-35-31-13 21-22 6m46-53 16 16 17-5m-34-11-16 9-6 13"/></g></g>`),
  },
  'pool-water': {
    color:'#6edcea',
    shapes:'<path d="m35 100 137-55 113 55-122 66Z" fill="#132a45"/><path d="m35 100 128 47 122-47v21l-122 55-128-59Z" fill="url(#vault-metal)"/><path class="vault-water" d="m52 105 120-43 96 40-106 55Z" fill="currentColor" fill-opacity=".6"/><path class="vault-wave" d="m69 111 114-42m-98 50 115-43m-95 50 113-41m-99 51 117-44m-99 52 118-47"/><path d="M97 147v-29q-1-8 6-9 6-1 6 7v34m-12-23 12 4m-12 5 12 4"/><g class="vault-water-digits" fill="#d7fcff" stroke="none" font-size="13" font-weight="750"><text x="148" y="59">3</text><text x="176" y="116">1</text><text x="207" y="76">7</text></g>',
  },
  lunar: {
    color:'#c4caff',
    shapes:'<g opacity=".55" fill="currentColor" stroke="none"><circle cx="58" cy="55" r="2"/><circle cx="260" cy="43" r="3"/><circle cx="237" cy="110" r="2"/><circle cx="88" cy="35" r="2"/><circle cx="268" cy="71" r="1.5"/></g><g class="vault-moon"><circle cx="174" cy="86" r="55" fill="url(#vault-metal)"/><path d="M139 46q-27 62 39 92m-10-91 17 7-7 13-14-6Zm22 31 19-4 8 11-9 12-18-3Zm-39 10 13 6-2 13-13 3-6-10Z" opacity=".45"/></g><path class="vault-orbit" d="M63 156q74-117 155-114" stroke="#ffe0a0" stroke-dasharray="4 6"/><circle cx="63" cy="156" r="18" fill="#214465"/><path d="m48 149 13-5 8 7-8 6 7 8" stroke="#82dfc8"/>',
  },
  'board-game': {
    color:'#8eebc7',
    shapes:'<g transform="translate(145 76) matrix(1 .37 -1 .37 0 0)">' + tiles(5,5,(x,y,i) => `<rect class="vault-tile" style="--i:${i}" x="${x*25}" y="${y*25}" width="22" height="22" rx="2" fill="${x===0||y===4 ? 'currentColor' : '#335263'}" fill-opacity=".5"/>`) + '</g><g class="vault-die"><path d="m120 82 22-18 28 10v26l-22 15-28-9Z" fill="url(#vault-metal)"/><path d="m120 82 28 9 22-17m-22 17v24"/><circle cx="144" cy="78" r="3"/><circle cx="130" cy="94" r="2"/><circle cx="157" cy="96" r="2"/></g><g class="vault-die" style="--i:4"><path d="m175 63 20-14 26 7v23l-19 14-27-8Z" fill="url(#vault-metal)"/><path d="m175 63 27 8 19-15m-19 15v22"/><circle cx="192" cy="59" r="3"/><circle cx="203" cy="60" r="3"/></g>',
  },
  piano: {
    color:'#d9deff',
    shapes:'<g transform="translate(46 92) skewX(-16)"><rect x="-7" y="-8" width="235" height="71" rx="6" fill="url(#vault-metal)"/>' + tiles(9,1,(x) => `<path class="vault-piano-key" style="--i:${x}" d="M${25*x} 0h23v56h-23Z" fill="#bac8e1"/>`) + [1,2,4,5,7,8].map(x => `<path d="M${25*x-8} 0h15v34h-15Z" fill="#151c30"/>`).join('') + '</g><path class="vault-orbit" d="M44 61q27 0 34-13t22 0 24 0 24 5 22-16 26 8 25-2 39-2" stroke="#e8cb77"/>',
  },
  'friends-sofa': {
    color:'#f6a76e',
    shapes:'<path d="M63 72q0-13 14-13h166q14 0 14 13v63H63Z" fill="#783e33"/>' + tiles(6,1,(x) => `<g class="vault-seat" style="--i:${x}" transform="translate(${87+x*29} 101)"><circle cy="-24" r="9" fill="currentColor"/><path d="M-11 23v-19a11 11 0 1 1 22 0v19Z" fill="url(#vault-metal)"/></g>`) + '<path d="M51 115q5-10 18-7l12 13h158l12-13q13-4 18 7v38H51Z" fill="url(#vault-metal)"/><path d="M67 153v12m186-12v12m-171-44v18m79-18v18m78-18v18M59 141h201"/>',
  },
  periodic: {
    color:'#a4f0c1',
    shapes:'<path class="vault-orbit" d="M57 56h200m-200 40h200M57 136h200M124 48v100m73-100v100" stroke="#e8cb77"/>' + tiles(5,3,(x,y,i) => `<g transform="translate(${67+x*39} ${42+y*37})"><g class="vault-period" style="--i:${i};--x:${(x-2)*6}px"><rect width="30" height="28" rx="3" fill="url(#vault-metal)"/><circle cx="${10+(i%3)*5}" cy="10" r="3" fill="currentColor"/><path d="M6 20h18" opacity=".6"/></g></g>`),
  },
  pixels: {
    color:'#a4baff',
    shapes:'<defs><pattern id="vault-pixel-grid" width="10" height="10" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="8" height="8" fill="currentColor" opacity=".65"/></pattern></defs><g class="vault-pixel-screen" transform="translate(48 45) skewY(-6)"><rect width="223" height="105" rx="6" fill="#213256"/><rect x="9" y="9" width="205" height="87" fill="url(#vault-pixel-grid)"/><path d="m53 70 24-28 20 14 36-33 44 49Z" fill="#e8cb77" stroke="none"/><path d="M82 106h58l11 22H71Z" fill="url(#vault-metal)"/></g>',
  },
  'terracotta-army': {
    color:'#f0ab77',
    shapes:'<g class="vault-army"><path class="vault-earth" d="m28 161 77-97h108l80 97-131 24Z" fill="#562f2b"/><path d="m75 108 164 0m-182 23h200m-218 24h236M135 65l-48 102m97-102 50 102" opacity=".43"/>' + tiles(4,3,(x,y,i) => `<g transform="translate(${160+(x-1.5)*(35+y*19)} ${69+y*25}) scale(${.48+y*.18})"><g class="vault-warrior" style="--i:${i}" fill="url(#vault-metal)">${figure}<path d="M-12 20h24m-25 6h26M15 43V-12l4-8 4 8Z" fill="#ae7159"/></g></g>`) + '<g class="vault-dust" fill="#dcaa83" stroke="none"><ellipse cx="90" cy="148" rx="42" ry="13"/><ellipse cx="152" cy="156" rx="58" ry="16"/><ellipse cx="221" cy="145" rx="51" ry="15"/></g></g>',
  },
};

function openingTiles() {
  return `<g class="vault-opening-tiles" transform="translate(160 96) matrix(1 .32 -1 .32 0 0)">` +
    tiles(6,6,(x,y,i) => `<rect style="--i:${(x+y)*3+i%3}" x="${x*23}" y="${y*23}" width="22" height="22" rx="1.2" fill="${(x+y)%2 ? '#e8cb77' : '#667aa3'}" opacity="${x===y || (x<2&&y<2) ? '.7' : '.28'}"/>`) +
    '<rect x="1" y="1" width="44" height="44" fill="none" stroke="#edc87b" stroke-width="2" style="--i:14"/><rect x="69" y="69" width="67" height="67" fill="none" stroke="#edc87b" stroke-width="2" style="--i:20"/></g>';
}

export function vaultArt(effect, first) {
  const {color, shapes} = scenes[effect];
  return `<svg viewBox="0 0 320 194" fill="none" style="color:${color}" aria-hidden="true">
    <defs>
      <linearGradient id="vault-metal" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".65"/><stop offset="1" stop-color="#202b47"/></linearGradient>
      <radialGradient id="vault-light"><stop stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="160" cy="105" rx="143" ry="86" fill="url(#vault-light)"/>
    <g class="vault-floor" stroke="currentColor" stroke-opacity=".26">
      <path d="m18 153 142-46 142 46-142 37Z" fill="#1d2743"/>
      <path d="m54 142 142 39m-106-51 141 41m-105-52 140 43m0-20-142 39m106-51-141 41m105-52-140 43"/>
    </g>
    ${first ? openingTiles() : ''}
    <g class="vault-object" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>
  </svg>`;
}
