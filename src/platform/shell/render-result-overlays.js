// Step 6c-3: one static source of truth for daily result and level-clear structures.
// Runtime state, leaderboard traffic, and game-specific business behavior stay in their games.
const SVG_COMMON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const SVG_PATHS = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/>',
    retry: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v4h-4"/>',
    next: '<path d="M4 12h14.5"/><path d="M12.5 6l6 6-6 6"/>',
};
const CLASSIC_TITLES = {
    'gravity-slingshot': '🏆 Global · Today\'s Course',
    lumen: '🏆 Global · Today\'s Puzzle',
    circuit: '🏆 <span data-i18n="leaderboard">Global · Today\'s Puzzle</span>',
    'silk-dew': 'Global · Today\'s Course',
    'bond-forge': 'Global · Today\'s Challenge',
};
const CLASSIC_LINES = {
    lumen: 'Flips 0 · Par 0',
    circuit: 'Moves 0 · Par 0',
    'silk-dew': 'Cuts 0 · Par 0',
};
function resultRoles(game){
    const result=game.shell?.results;
    if(result===undefined)return [];
    if(result==='over')return ['over'];
    if(result==='both')return ['clear','over'];
    throw new Error('invalid result roles '+game.id);
}
function resultButton(game,role,icon,label,variant='normal'){
    const p=game.prefix, science=!!game.shell?.styles?.scienceShowcase, bond=game.id==='bond-forge',circuit=game.id==='circuit';
    const suffix=variant==='primary'?' '+p+'-btn-primary':variant==='ghost'?' '+p+'-btn-ghost':'';
    const common=bond?'':` game-action-btn${variant==='normal'?'':` game-action-btn--${variant}`}`;
    const klass=`${p}-btn${suffix} game-btn${common}`;
    const key=circuit?({next:'next',replay:'retry',menu1:'menu',menu2:'menu',again:'again'}[role]):null;
    const svg=science?'':SVG_COMMON+SVG_PATHS[icon]+'</svg>';
    const span=`<span${key?` data-i18n="${key}"`:''}>${science?'':label}</span>`;
    return `<button class="${klass}" id="${p}-btn-${role}">${svg}${span}</button>`;
}
function renderResultOverlay(game,kind,indent='            '){
    const p=game.prefix, id=game.id, science=!!game.shell?.styles?.scienceShowcase, bond=id==='bond-forge';
    const line=(depth,html)=>indent+'    '.repeat(depth)+html;
    const row=`<div class="${p}-btn-row${bond?'':' game-action-row'}">`;
    if(kind==='clear'){
        const stars=science?'☆☆☆':id==='silk-dew'?'★★★':'⭐⭐⭐';
        const message=CLASSIC_LINES[id]||'';
        return [
            line(0,`<div class="${p}-overlay ${p}-overlay-dim hidden game-overlay" id="${p}-clear">`),
            line(1,`<div class="${p}-card">`),
            line(2,`<h2 class="${p}-card-title game-clear-title" id="${p}-clear-stars">${stars}</h2>`),
            line(2,`<div class="${p}-card-line game-start-card-line" id="${p}-clear-line">${message}</div>`),
            ...(science?[line(2,`<div class="game-lb-status hidden" id="${p}-clear-status" role="status"></div>`)]:[]),
            line(2,row),
            line(3,resultButton(game,'next','next','Next','primary')),
            line(3,resultButton(game,'replay','retry','Retry')),
            line(3,resultButton(game,'menu1','home','Home','ghost')),
            line(2,'</div>'),line(1,'</div>'),line(0,'</div>'),
        ].join('\n');
    }
    if(kind!=='over')throw new Error('unknown result overlay kind '+kind);
    const titleAttrs=bond?' data-i18n="dailyDone"':'';
    const title=science?'':'Daily complete!';
    const scoreCommon=bond?'':' game-over-score';
    const subCommon=bond?'':' game-over-sub';
    const boardLabel=science?'':CLASSIC_TITLES[id];
    const boardKey=science||id==='silk-dew'||bond?' data-i18n="leaderboard"':'';
    const labelText=science?'':'Username';
    const labelKey= id==='ripple-duet'?'playerName':['gravity-slingshot','lumen','circuit'].includes(id)?'usernameLabel':null;
    const labelAttrs=labelKey?` data-i18n="${labelKey}"`:'';
    const inputAttrs=labelKey==='usernameLabel'?' data-i18n-placeholder="usernameLabel"':'';
    const statusRole=['silk-dew','crystal-bloom','flame-verse','ripple-duet'].includes(id)?' role="status"':'';
    return [
        line(0,`<div class="${p}-overlay hidden game-overlay" id="${p}-over">`),
        line(1,`<h2 class="${p}-overlay-title" id="${p}-over-title"${titleAttrs}>${title}</h2>`),
        line(1,`<div class="${p}-over-score${scoreCommon}" id="${p}-over-score">${id==='gravity-slingshot'?'7':'0'}</div>`),
        line(1,`<div class="${p}-over-sub${subCommon}" id="${p}-over-sub"></div>`),
        line(1,row),
        line(2,resultButton(game,'copy','copy','Copy')),
        line(2,resultButton(game,'menu2','home','Home','ghost')),
        line(1,'</div>'),
        line(1,`<div class="${p}-lb game-lb">`),
        line(2,`<div class="${p}-lb-title game-lb-title" id="${p}-lb-title"${boardKey}>${boardLabel}</div>`),
        line(2,`<div class="${p}-lb-list game-lb-list" id="${p}-lb-list"></div>`),
        line(2,`<div class="${p}-lb-status game-lb-status" id="${p}-lb-status"${statusRole}></div>`),
        line(2,`<div class="${p}-username-row game-lb-username-row">`),
        line(3,`<label class="${p}-username-label game-lb-username-label" for="${p}-username" id="${p}-username-label"${labelAttrs}>${labelText}</label>`),
        line(3,`<input class="${p}-username game-lb-username" id="${p}-username" maxlength="20" autocomplete="off"${inputAttrs}>`),
        line(2,'</div>'),line(1,'</div>'),
        line(1,resultButton(game,'again','retry','Again','primary')),
        line(0,'</div>'),
    ].join('\n');
}
export { resultRoles, renderResultOverlay };
