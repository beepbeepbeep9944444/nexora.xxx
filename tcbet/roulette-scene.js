// Roulette castle theme: sky + castle backdrop and the TC2 character leaning out of the castle window.
// Hand-drawn vector art (blocky Roblox style), so it stays sharp at any size.
window.TCBET_SCENE = {
  backdrop: `<svg class="rs-bg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="rsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c0fb"/><stop offset="1" stop-color="#8d9cf2"/></linearGradient>
    <pattern id="rsBrick" width="60" height="30" patternUnits="userSpaceOnUse">
      <rect width="60" height="30" fill="#7c80e6"/><path d="M0 15H60M30 0V15M0 15V30M60 15V30" stroke="#6a6dd6" stroke-width="2"/>
      <rect x="4" y="3" width="22" height="9" fill="#878be9" opacity=".5"/></pattern>
  </defs>
  <rect width="1000" height="640" fill="url(#rsSky)"/>
  <g fill="#fff" opacity=".55">
    <ellipse cx="120" cy="80" rx="90" ry="26"/><ellipse cx="190" cy="66" rx="60" ry="30"/>
    <ellipse cx="720" cy="60" rx="110" ry="28"/><ellipse cx="800" cy="44" rx="70" ry="30"/>
    <ellipse cx="460" cy="120" rx="80" ry="20"/>
  </g>
  <g fill="#8f9bea">
    <path d="M40 330V170l40-60 40 60v160z"/><rect x="120" y="210" width="120" height="120"/><path d="M110 210h140l-10-20H120z"/>
    <path d="M700 330V150l35-70 35 70v180z"/><rect x="770" y="200" width="160" height="130"/><path d="M880 200V120l30-50 30 50v80z"/>
  </g>
  <g fill="#8088e6"><rect x="0" y="300" width="1000" height="60"/>${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 50 + 8}" y="284" width="30" height="20"/>`).join("")}</g>
  <rect x="0" y="350" width="1000" height="290" fill="url(#rsBrick)"/>
  <g stroke="#5b5ec9" stroke-width="3" fill="none" opacity=".7"><path d="M80 420l20 18-6 22"/><path d="M880 470l-14 16 10 18"/><path d="M520 560l18-10 10 16"/></g>
  <g fill="#3b3f8f" opacity=".7"><path d="M905 250c6-8 16-8 22 0-4 2-8 6-10 10-2-4-6-8-12-10z"/><path d="M160 150l10-4 10 4-10 2z"/><path d="M640 120l8-3 8 3-8 2z"/></g>
</svg>`,
  logo: `<svg class="rs-logo" viewBox="0 0 360 96" aria-label="TCBET Roulette">
  <defs><linearGradient id="rsLogoFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d5ff"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
  <g font-family="Rubik, Inter, sans-serif" font-weight="900" text-anchor="middle" paint-order="stroke" stroke-linejoin="round">
    <text x="180" y="44" font-size="40" fill="url(#rsLogoFill)" stroke="#3b1f7a" stroke-width="10">TCBET</text>
    <text x="180" y="86" font-size="38" fill="url(#rsLogoFill)" stroke="#3b1f7a" stroke-width="10">ROULETTE</text>
  </g>
  <g fill="#fde68a"><path d="M40 20l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M322 60l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z"/></g>
</svg>`,
  // TC2-style character: black hair over one eye, white shirt, green vest with an Italian flag patch and belt buckle, rifle on the shoulder
  character: `<svg class="rs-char" viewBox="0 0 240 260" aria-label="TC2 character in the castle window">
  <g stroke="#1f2430" stroke-width="2.5" stroke-linejoin="round">
    <rect x="186" y="6" width="12" height="150" rx="3" fill="#2b2f38" transform="rotate(14 192 80)"/>
    <rect x="178" y="70" width="18" height="34" rx="3" fill="#3a3f4a" transform="rotate(14 187 87)"/>
    <rect x="132" y="128" width="64" height="58" rx="8" fill="#eef0f3" transform="rotate(-38 164 157)"/>
    <rect x="150" y="70" width="48" height="26" rx="6" fill="#f4ddb6" transform="rotate(-20 174 83)"/>
    <rect x="28" y="140" width="66" height="96" rx="9" fill="#eef0f3"/>
    <g transform="translate(40 168) rotate(-12)"><rect width="22" height="15" fill="#fff"/><rect width="7.3" height="15" fill="#22a447"/><rect x="14.7" width="7.3" height="15" fill="#d93a3a"/></g>
    <rect x="70" y="132" width="104" height="128" rx="10" fill="#3ec85a"/>
    <path d="M98 132l24 22 24-22v14l-24 20-24-20z" fill="#fff"/>
    <rect x="80" y="170" width="30" height="24" rx="4" fill="#36b24f"/><rect x="134" y="170" width="30" height="24" rx="4" fill="#36b24f"/>
    <circle cx="122" cy="186" r="4" fill="#e6e8ee"/><circle cx="122" cy="204" r="4" fill="#e6e8ee"/>
    <rect x="70" y="222" width="104" height="16" fill="#f3f4f6"/><path d="M70 226h104M70 234h104" stroke="#3b5bdb" stroke-width="4"/>
    <g transform="translate(104 219)"><rect width="36" height="22" rx="3" fill="#fff"/><rect width="12" height="22" fill="#22a447"/><rect x="24" width="12" height="22" fill="#d93a3a"/></g>
    <rect x="80" y="54" width="84" height="80" rx="16" fill="#f4ddb6"/>
    <path d="M76 70c-4-30 22-50 50-48 30 2 46 24 42 50-6-10-14-16-22-18 2 12-4 26-14 36-2-14-8-26-18-32-8 8-12 20-12 34-6-8-14-16-26-22z" fill="#14161c"/>
    <path d="M74 64c-10 22-6 54 6 78l8-6c-6-22-6-46 0-66z" fill="#14161c"/>
    <path d="M166 70c10 20 8 48-2 70l-8-6c6-20 6-42 2-60z" fill="#14161c"/>
    <ellipse cx="146" cy="96" rx="5" ry="7" fill="#14161c" stroke="none"/>
    <path d="M118 116c10 6 22 4 30-4" fill="none" stroke-width="3"/>
  </g>
</svg>`,
};
