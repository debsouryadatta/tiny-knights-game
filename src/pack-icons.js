import './pack-icons.css';

const root='/assets/tiny-swords/UI Elements/UI Elements/';
const art={attack:'05',ability1:'05',ability2:'06',ability3:'10',recall:'08',regen:'07',gather:'01',build:'02'};
// The free pack's painted sword, shield, crossed swords and resource icons
// share a 64px canvas and remain crisp inside the existing circular controls.
export function packIcon(name){
  return `<i class="pack-icon" aria-hidden="true"><img src="${root}Icons/Icon_${art[name]||'05'}.png" alt="" draggable="false"></i>`;
}
