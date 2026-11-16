import {useEffect,useMemo,useState} from 'react'
import readXlsxFile from 'read-excel-file'
import {createClient} from '@supabase/supabase-js'

const sb=createClient(import.meta.env.VITE_SUPABASE_URL||'https://ambjtvcsakliqhhcumol.supabase.co',
  import.meta.env.VITE_SUPABASE_KEY||'sb_publishable_TSlwsdk0uQNUVgf4ZBymTA_bvN8usWt')

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ')
const key=r=>norm(r.titulo)+'|'+norm(r.autor)
const txt=v=>String(v??'').trim()
const err=e=>e?.message||'Erro desconhecido'

function parseCsv(source){
  const text=source.replace(/^\uFEFF/,'')
  const header=text.split(/\r?\n/,1)[0]||''
  const delim=(header.match(/;/g)||[]).length>=(header.match(/,/g)||[]).length?';':','
  const out=[];let field='',row=[],quoted=false
  for(let i=0;i<text.length;i++){
    const c=text[i]
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted
    }else if(c===delim&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++
      row.push(field);out.push(row);row=[];field=''
    }else field+=c
  }
  if(field||row.length){row.push(field);out.push(row)}
  return out
}

async function fetchAll(table,cols){
  let result=[]
  for(let start=0;;start+=500){
    const {data,error}=await sb.from(table).select(cols).range(start,start+499)
    if(error)throw error
    result=result.concat(data||[])
    if(!data||data.length<500)break
  }
  return result
}

function normalizeSpreadsheet(grid){
  const headers=(grid[0]||[]).map(norm)
  const col=(names)=>names.map(norm).map(n=>headers.indexOf(n)).find(i=>i>=0)
  const idx={
    titulo:col(['Título','Titulo','Livro']),autor:col(['Autor(es)','Autor','Autores']),
    editora:col(['Editora']),ano:col(['Ano','Ano de publicação','Ano publicação']),
    categoria:col(['Categoria sugerida','Categoria']),qtd:col(['Exemplares observados','Exemplares','Quantidade']),
    foto:col(['Foto(s)','Fotos']),status:col(['Status']),obs:col(['Observações','Observacoes']),
    isbn:col(['ISBN'])
  }
  if(idx.titulo===undefined||idx.autor===undefined)throw new Error('A planilha precisa ter as colunas Título e Autor(es) (ou Autor).')
  const get=(row,k)=>idx[k]===undefined?null:row[idx[k]]
  const parsed=grid.slice(1).map((r,i)=>{
    const titulo=txt(get(r,'titulo')),autor=txt(get(r,'autor'))
    const raw=get(r,'qtd')
    const qtd=raw==null||raw===''?1:Number(raw)
    const ano=txt(get(r,'ano'))
    return {n:i+2,titulo,autor,editora:txt(get(r,'editora')),
      ano:ano?Number(ano):null,isbn:txt(get(r,'isbn')),categoria:txt(get(r,'categoria')),
      qtd:Number.isInteger(qtd)&&qtd>=1&&qtd<=50?qtd:0,
      foto:txt(get(r,'foto')),status:txt(get(r,'status')),obs:txt(get(r,'obs')),
      checked:!!titulo&&!!autor,concluido:false}
  }).filter(r=>r.titulo||r.autor)
  if(!parsed.length)throw new Error('Nenhum título encontrado na aba de acervo.')
  return parsed
}

export default function ImportarAcervo({say}){
  const [rows,setRows]=useState([])
  const [file,setFile]=useState('')
  const [existing,setExisting]=useState([])
  const [loading,setLoading]=useState(false)
  const [sending,setSending]=useState(false)
  const [report,setReport]=useState([])
  const [settings,setSettings]=useState({prateleira:'',estado:'Bom'})
  useEffect(()=>{fetchAll('livros','id,titulo,autor').then(setExisting).catch(e=>say('err','Erro ao consultar livros: '+err(e)))},[])
  const existingKeys=useMemo(()=>new Set(existing.map(key)),[existing])
  const firstSeen=new Set()
  const withDuplicate=rows.map(r=>{
    const k=key(r),duplicate=existingKeys.has(k)||firstSeen.has(k)
    if(r.titulo&&r.autor)firstSeen.add(k)
    return {...r,duplicate,invalid:!r.titulo||!r.autor||r.qtd<1||r.qtd>50||!Number.isInteger(r.qtd)||
      (r.ano!=null&&(!Number.isInteger(r.ano)||r.ano<1000||r.ano>2100))}
  })
  const ready=withDuplicate.filter(r=>r.checked&&!r.duplicate&&!r.invalid&&!r.concluido)
  const set=(n,k,v)=>setRows(old=>old.map(r=>r.n===n?{...r,[k]:v}:r))
  async function loadFile(e){
    const chosen=e.target.files?.[0]
    if(!chosen)return
    setLoading(true);setRows([]);setFile('');setReport([])
    try{
      if(chosen.size>5*1024*1024)throw new Error('Selecione um arquivo de até 5 MB.')
      const suffix=chosen.name.toLowerCase()
      if(!/\.(xlsx|csv)$/.test(suffix))throw new Error('Use um arquivo Excel .xlsx ou .csv.')
      let grid
      if(suffix.endsWith('.csv'))grid=parseCsv(await chosen.text())
      else {
        try{grid=await readXlsxFile(chosen,{sheet:'Acervo identificado'})}
        catch{grid=await readXlsxFile(chosen)}
      }
      const items=normalizeSpreadsheet(grid)
      setRows(items);setFile(chosen.name)
      say('ok',items.length+' linha(s) lida(s). Confira antes de importar.')
    }catch(error){say('err','Não foi possível ler a planilha: '+err(error))}
    finally{setLoading(false);e.target.value=''}
  }
  async function importNow(){
    if(!ready.length)return say('err','Não há títulos válidos selecionados.')
    if(!window.confirm('Importar '+ready.length+' título(s) e '+ready.reduce((s,r)=>s+r.qtd,0)+' exemplar(es) para o banco real? Verifique as quantidades antes de confirmar.'))return
    setSending(true);const output=[]
    try{
      const actual=await fetchAll('livros','id,titulo,autor')
      const known=new Set(actual.map(key))
      const categories=await fetchAll('categorias','id,nome')
      const categoryMap=new Map(categories.map(c=>[norm(c.nome),c.id]))
      for(const r of ready){
        if(known.has(key(r))){output.push({n:r.n,titulo:r.titulo,status:'Ignorado: já cadastrado'});continue}
        let insertedId=null
        try{
          let categoria_id=null
          if(r.categoria){
            const normalized=norm(r.categoria)
            categoria_id=categoryMap.get(normalized)||null
            if(!categoria_id){
              const {data,error}=await sb.from('categorias').insert({nome:r.categoria}).select('id').single()
              if(error)throw error
              categoria_id=data.id;categoryMap.set(normalized,categoria_id)
            }
          }
          const description=[r.obs&&'Observações: '+r.obs,r.status&&'Situação na planilha: '+r.status,
            r.foto&&'Fotografia(s) de origem: '+r.foto].filter(Boolean).join('\n')
          const {data:book,error:bookError}=await sb.from('livros').insert({
            titulo:r.titulo,autor:r.autor,editora:r.editora||null,
            ano_publicacao:r.ano||null,isbn:r.isbn||null,categoria_id,
            descricao:description||null}).select('id').single()
          if(bookError)throw bookError
          insertedId=book.id
          const exemplares=Array.from({length:r.qtd},()=>({
            livro_id:book.id,
            codigo:'ILK-'+crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase(),
            prateleira:settings.prateleira.trim()||null,
            estado_conservacao:settings.estado,ativo:true}))
          const {error:copyError}=await sb.from('exemplares').insert(exemplares)
          if(copyError)throw copyError
          known.add(key(r));output.push({n:r.n,titulo:r.titulo,status:'Importado ('+r.qtd+' exemplar(es))',ok:true})
          setRows(current=>current.map(item=>item.n===r.n?{...item,concluido:true,checked:false}:item))
        }catch(error){
          let detail=err(error)
          if(insertedId){
            // Sem empréstimos em um cadastro recém-criado: desfazer o título se falhar a inserção de exemplares.
            const {error:rollbackError}=await sb.from('livros').delete().eq('id',insertedId)
            if(rollbackError)detail+='; atenção: o título foi criado, mas não pôde ser revertido ('+err(rollbackError)+')'
          }
          output.push({n:r.n,titulo:r.titulo,status:'Erro: '+detail})
        }
      }
      setExisting(await fetchAll('livros','id,titulo,autor'))
      setReport(output)
      const ok=output.filter(x=>x.ok).length
      say(ok?'ok':'err',ok+' título(s) importado(s); '+(output.length-ok)+' ignorado(s) ou com erro. Confira o relatório.')
    }catch(error){say('err','Falha ao preparar importação: '+err(error))}
    finally{setSending(false)}
  }
  const successes=report.filter(r=>r.ok).length
  return <div>
    <div className="head"><h1>Importar acervo</h1></div>
    <div className="panel">
      <h3>Importação de Excel ou CSV</h3>
      <p>Selecione a planilha do acervo. Para o modelo ILK, somente a aba <b>Acervo identificado</b> será lida.
        A aba <b>Conferência pendente</b> não será cadastrada automaticamente.</p>
      <label htmlFor="ilk-import-file">Arquivo .xlsx ou .csv (até 5 MB)</label>
      <input id="ilk-import-file" type="file" accept=".xlsx,.csv" onChange={loadFile} disabled={loading||sending}/>
      {loading&&<p>Lendo arquivo…</p>}
    </div>
    {!!rows.length&&<>
      <div className="panel">
        <h3>{file}</h3>
        <p>Foram encontradas <b>{rows.length}</b> linhas. <b>{ready.length}</b> prontas para importação;
          {' '}<b>{withDuplicate.filter(r=>r.duplicate).length}</b> possíveis duplicatas.
          Os exemplares observados nas fotografias não constituem contagem definitiva: confirme a quantidade abaixo.</p>
        <div className="grid">
          <div><label>Prateleira dos novos exemplares (opcional)</label>
            <input value={settings.prateleira} disabled={sending} onChange={e=>setSettings({...settings,prateleira:e.target.value})} placeholder="Ex.: A3"/></div>
          <div><label>Estado de conservação</label>
            <select value={settings.estado} disabled={sending} onChange={e=>setSettings({...settings,estado:e.target.value})}>
              {['Ótimo','Bom','Regular','Ruim'].map(e=><option key={e}>{e}</option>)}</select></div>
        </div>
      </div>
      <div className="tw"><table className="import-table">
        <thead><tr><th>Importar</th><th>Linha</th><th>Título</th><th>Autor(es)</th><th>Categoria sugerida</th>
          <th>Exemplares</th><th>Verificação</th></tr></thead>
        <tbody>{withDuplicate.map(r=><tr key={r.n}>
          <td><input type="checkbox" aria-label={'Selecionar linha '+r.n} checked={r.checked&&!r.duplicate&&!r.concluido}
            disabled={sending||r.duplicate||r.concluido} onChange={e=>set(r.n,'checked',e.target.checked)}/></td>
          <td>{r.n}</td>
          <td><input value={r.titulo} disabled={sending||r.concluido} aria-label={'Título da linha '+r.n}
            onChange={e=>set(r.n,'titulo',e.target.value)}/></td>
          <td><input value={r.autor} disabled={sending||r.concluido} aria-label={'Autor da linha '+r.n}
            onChange={e=>set(r.n,'autor',e.target.value)}/></td>
          <td><input value={r.categoria} disabled={sending||r.concluido} aria-label={'Categoria da linha '+r.n}
            onChange={e=>set(r.n,'categoria',e.target.value)}/></td>
          <td><input type="number" min="1" max="50" value={r.qtd} disabled={sending||r.concluido}
            aria-label={'Exemplares da linha '+r.n} onChange={e=>set(r.n,'qtd',Number(e.target.value))}/></td>
          <td>{r.concluido?'Importado':r.duplicate?'Já consta no acervo / repetido na planilha':
            r.invalid?'Corrigir título, autor, ano ou quantidade':r.status||'Pronto'}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="panel" style={{marginTop:16}}>
        <p><b>{ready.length}</b> título(s) selecionado(s), <b>{ready.reduce((n,r)=>n+r.qtd,0)}</b> exemplar(es) para cadastro.</p>
        <button className="b p" disabled={sending||!ready.length} onClick={importNow}>
          {sending?'Importando…':'Confirmar importação no Supabase'}</button>
      </div>
    </>}
    {!!report.length&&<div className="panel">
      <h3>Relatório da última importação</h3>
      <p>{successes} título(s) importado(s) de {report.length} processado(s).</p>
      <div className="tw"><table><thead><tr><th>Linha</th><th>Título</th><th>Resultado</th></tr></thead>
        <tbody>{report.map(r=><tr key={r.n}><td>{r.n}</td><td>{r.titulo}</td><td>{r.status}</td></tr>)}</tbody></table></div>
    </div>}
  </div>
}
