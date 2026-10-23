// Static, parser-located result regions; never rebuild adjacent game-owned HTML.
import { parse, parseFragment } from 'parse5';
import { resultRoles, renderResultOverlay } from '../../src/platform/shell/render-result-overlays.js';
import { nodesOf, markerRange, lineIndent, validatePageBindings } from './shell-regions.mjs';
function resultDom(node){
    if(node.nodeName==='#comment')return null;
    if(node.nodeName==='#text')return node.value.trim()?['text',node.value]:null;
    if(!node.tagName)return null;
    return [node.tagName,node.namespaceURI||'',(node.attrs||[]).map(a=>[a.name,a.value,a.namespace||'',a.prefix||'']), (node.childNodes||[]).map(resultDom).filter(Boolean)];
}
function transformResultRegions(source,game){
    const nodes=nodesOf(parse(source,{sourceCodeLocationInfo:true}));
    const roles=resultRoles(game);
    const edits=[],newline=source.includes('\r\n')?'\r\n':'\n';
    const ids=new Set(roles.map(role=>'result-'+role));
    for(const node of nodes){
        if(node.nodeName==='#comment'&&/^registry:(?:begin|end) result-/.test(node.data.trim())){
            const name=node.data.trim().split(/\s+/)[1];
            if(!ids.has(name))throw new Error(game.id+': undeclared result region '+name);
        }
    }
    for(const role of roles){
        const name='result-'+role,label=game.id+'/'+name,actualId=game.prefix+'-'+role;
        const targets=nodes.filter(node=>node.attrs?.some(a=>a.name==='id'&&a.value===actualId));
        if(targets.length!==1)throw new Error(label+': expected exactly one overlay');
        const target=targets[0],klass=target.attrs?.find(a=>a.name==='class')?.value||'';
        if(target.tagName!=='div'||!klass.split(/\s+/).includes('game-overlay')||!klass.split(/\s+/).includes('hidden'))throw new Error(label+': invalid overlay ownership');
        const marker=markerRange(source,nodes,name,label);
        if(marker){
            const owned=marker.nodes.filter(n=>n.nodeName!=='#comment'&&!(n.nodeName==='#text'&&!n.value.trim()));
            if(owned.length!==1||owned[0]!==target)throw new Error(label+': region must own exactly the expected overlay');
        }
        const loc=target.sourceCodeLocation;
        if(!loc?.endTag)throw new Error(label+': overlay must have an explicit closing tag');
        const range=marker||{...lineIndent(source,loc.startOffset,label),end:loc.endOffset};
        const rendered=renderResultOverlay(game,role,range.indent).replace(/\n/g,newline);
        if(!marker){
            const expected=parseFragment(rendered).childNodes.find(n=>n.tagName);
            if(JSON.stringify(resultDom(target))!==JSON.stringify(resultDom(expected))){
                throw new Error(label+': initial migration would change DOM; keep custom node game-owned');
            }
        }
        edits.push({...range,content:range.indent+'<!-- registry:begin '+name+' -->'+newline+rendered+newline+range.indent+'<!-- registry:end '+name+' -->'});
    }
    edits.sort((a,b)=>b.start-a.start);
    let result=source,limit=source.length;
    for(const edit of edits){
        if(edit.end>limit)throw new Error(game.id+': overlapping result regions');
        result=result.slice(0,edit.start)+edit.content+result.slice(edit.end);
        limit=edit.start;
    }
    if(roles.length)validatePageBindings(source,result,game.id);
    return {src:result,state:result===source?'clean':'written'};
}
export { transformResultRegions };
