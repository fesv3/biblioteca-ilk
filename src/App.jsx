import {useEffect,useState,useCallback} from 'react'
import {createClient} from '@supabase/supabase-js'

const ADMIN='biblioteca.institutolutherking@gmail.com'
// Somente a chave pública (publishable). Nunca coloque service_role aqui.
const sb=createClient(import.meta.env.VITE_SUPABASE_URL||'https://ambjtvcsakliqhhcumol.supabase.co',
  import.meta.env.VITE_SUPABASE_KEY||'sb_publishable_TSlwsdk0uQNUVgf4ZBymTA_bvN8usWt')

const loc=d=>{d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
const hoje=()=>loc(new Date())
const mais=n=>{const d=new Date();d.setDate(d.getDate()+n);return loc(d)}
const dia=d=>d?String(d).slice(0,10):''
const fmt=d=>d?dia(d).split('-').reverse().join('/'):'—'
const msg=e=>e?.code==='23505'?'Já existe um registro com este valor único (ex.: código, matrícula ou CPF).'
  :e?.code==='23503'?'Este registro está vinculado a outros dados e não pode ser removido.'
  :e?.code==='42501'?'Operação negada pelas políticas de segurança (RLS).':(e?.message||'Erro inesperado.')

function exportar(nome,cols,rows){
  const esc=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
  const t=[cols.map(c=>esc(c[0])),...rows.map(r=>cols.map(c=>esc(c[1](r))))].map(l=>l.join(';')).join('\r\n')
  const a=document.createElement('a')
  a.href=URL.createObjectURL(new Blob(['\ufeff'+t],{type:'text/csv;charset=utf-8'}))
  a.download=`${nome}-${hoje()}.csv`;a.click()
}

function useData(table,select='*',order='criado_em',asc=false){
  const [rows,setRows]=useState([]),[loading,setL]=useState(true)
  const load=useCallback(async()=>{
    const {data,error}=await sb.from(table).select(select).order(order,{ascending:asc})
    if(error)console.error(error.message);setRows(data||[]);setL(false)
  },[table,select,order,asc])
  useEffect(()=>{load()},[load])
  return [rows,load,loading]
}

function Logo(){
  const [ok,setOk]=useState(true)
  return <div className="logo">{ok?<img src="/logo.png" alt="Instituto Luther King" onError={()=>setOk(false)}/>:<i>ILK</i>}
    <span>Biblioteca ILK<small>Instituto Luther King</small></span></div>
}

function Crud({title,table,select='*',fields,cols,say,actions,extra,nome}){
  const [rows,load,loading]=useData(table,select)
  const [q,setQ]=useState(''),[f,setF]=useState(null)
  const list=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const novo=()=>setF(Object.fromEntries(fields.map(x=>[x.k,x.type==='check'?true:''])))
  async function save(e){
    e.preventDefault();const p={}
    for(const x of fields){
      const v=f[x.k]
      if(x.req&&(v===''||v==null))return say('err',`Preencha o campo "${x.label}".`)
      if(x.k==='email'&&v&&!/^\S+@\S+\.\S+$/.test(v))return say('err','E-mail inválido.')
      if(x.k==='cpf'&&v&&String(v).replace(/\D/g,'').length!==11)return say('err','O CPF deve ter 11 dígitos.')
      p[x.k]=v===''||v==null?null:x.type==='number'?Number(v):typeof v==='string'?v.trim():v
    }
    const {error}=f.id?await sb.from(table).update(p).eq('id',f.id):await sb.from(table).insert(p)
    if(error)return say('err',msg(error))
    say('ok',f.id?'Registro atualizado com sucesso.':'Registro cadastrado com sucesso.');setF(null);load()
  }
  async function del(r){
    if(!confirm('Excluir este registro? Esta ação não pode ser desfeita.'))return
    const {error}=await sb.from(table).delete().eq('id',r.id)
    error?say('err',msg(error)):(say('ok','Registro excluído.'),load())
  }
  return <>
    <div className="head"><h1>{title}</h1><div className="bar">
      <input placeholder="Pesquisar…" value={q} onChange={e=>setQ(e.target.value)} aria-label="Pesquisar"/>
      <button className="b s" onClick={()=>exportar(nome||table,cols,list)}>Exportar CSV</button>
      <button className="b p" onClick={novo}>Novo cadastro</button></div></div>
    {extra}
    <div className="tw"><table><thead><tr>{cols.map(c=><th key={c[0]}>{c[0]}</th>)}<th>Ações</th></tr></thead>
      <tbody>{list.map(r=><tr key={r.id}>{cols.map(c=><td key={c[0]}>{c[1](r)}</td>)}
        <td className="a">{actions?.(r)}<button className="b s m" onClick={()=>setF({...r})}>Editar</button>
        <button className="b d m" onClick={()=>del(r)}>Excluir</button></td></tr>)}</tbody></table>
      {!list.length&&<div className="empty">{loading?'Carregando…':'Nenhum registro encontrado. Use “Novo cadastro” para começar.'}</div>}</div>
    {f&&<div className="ov"><form className="modal" onSubmit={save} noValidate>
      <h2 style={{marginBottom:14}}>{f.id?'Editar':'Novo'} · {title}</h2>
      <div className="grid">{fields.map(x=><div key={x.k} style={x.type==='area'?{gridColumn:'1/-1'}:null}>
        {x.type==='check'?<label><input type="checkbox" style={{width:'auto',marginRight:8}} checked={!!f[x.k]} onChange={e=>setF({...f,[x.k]:e.target.checked})}/>{x.label}</label>:<>
        <label>{x.label}{x.req&&' *'}</label>
        {x.type==='select'?<select value={f[x.k]??''} onChange={e=>setF({...f,[x.k]:e.target.value})}>
          <option value="">Selecione…</option>{x.opts.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        :x.type==='area'?<textarea rows={3} value={f[x.k]??''} onChange={e=>setF({...f,[x.k]:e.target.value})}/>
        :<input type={x.type||'text'} min={x.type==='number'?0:undefined} value={f[x.k]??''} onChange={e=>setF({...f,[x.k]:e.target.value})}/>}</>}</div>)}</div>
      <div className="bar" style={{marginTop:18,justifyContent:'flex-end'}}>
        <button type="button" className="b s" onClick={()=>setF(null)}>Cancelar</button>
        <button className="b p">Salvar</button></div></form></div>}
  </>
}

const ESTADOS=['Ótimo','Bom','Regular','Ruim'].map(x=>[x,x])
const Categorias=({say})=><Crud title="Categorias" table="categorias" say={say}
  fields={[{k:'nome',label:'Nome',req:1},{k:'descricao',label:'Descrição',type:'area'}]}
  cols={[['Nome',r=>r.nome],['Descrição',r=>r.descricao||'—']]}/>

function Livros({say}){
  const [cats]=useData('categorias','*','nome',true)
  return <Crud title="Livros" table="livros" select="*,categorias(nome)" say={say}
    fields={[{k:'titulo',label:'Título',req:1},{k:'autor',label:'Autor',req:1},{k:'editora',label:'Editora'},
      {k:'ano_publicacao',label:'Ano de publicação',type:'number'},{k:'isbn',label:'ISBN'},
      {k:'categoria_id',label:'Categoria',type:'select',opts:cats.map(c=>[c.id,c.nome])},
      {k:'descricao',label:'Descrição',type:'area'}]}
    cols={[['Título',r=>r.titulo],['Autor',r=>r.autor],['Categoria',r=>r.categorias?.nome||'—'],
      ['Editora',r=>r.editora||'—'],['Ano',r=>r.ano_publicacao||'—'],['ISBN',r=>r.isbn||'—']]}/>
}

function Exemplares({say}){
  const [livros]=useData('livros','id,titulo','titulo',true)
  const [emp]=useData('emprestimos','exemplar_id,data_devolucao')
  const busy=new Set(emp.filter(e=>!e.data_devolucao).map(e=>e.exemplar_id))
  return <Crud title="Exemplares e prateleiras" table="exemplares" select="*,livros(titulo)" say={say} nome="exemplares"
    fields={[{k:'livro_id',label:'Livro',type:'select',req:1,opts:livros.map(l=>[l.id,l.titulo])},
      {k:'codigo',label:'Código único',req:1},{k:'prateleira',label:'Prateleira'},
      {k:'estado_conservacao',label:'Estado de conservação',type:'select',opts:ESTADOS},{k:'ativo',label:'Exemplar ativo',type:'check'}]}
    cols={[['Código',r=>r.codigo],['Livro',r=>r.livros?.titulo||'—'],['Prateleira',r=>r.prateleira||'—'],
      ['Estado',r=>r.estado_conservacao||'—'],
      ['Situação',r=>!r.ativo?'Inativo':busy.has(r.id)?'Emprestado':'Disponível']]}/>
}

function Historico({l,onClose}){
  const [rows,setRows]=useState(null)
  useEffect(()=>{sb.from('emprestimos').select('*,exemplares(codigo,livros(titulo))').eq('leitor_id',l.id)
    .order('data_emprestimo',{ascending:false}).then(({data})=>setRows(data||[]))},[l.id])
  return <div className="panel"><div className="head"><h2>Histórico de {l.nome}</h2>
    <button className="b s m" onClick={onClose}>Fechar</button></div>
    {!rows?'Carregando…':!rows.length?'Este leitor ainda não realizou empréstimos.':
    <div className="tw"><table><thead><tr><th>Livro</th><th>Código</th><th>Empréstimo</th><th>Previsto</th><th>Devolução</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id}><td>{r.exemplares?.livros?.titulo}</td><td>{r.exemplares?.codigo}</td>
        <td>{fmt(r.data_emprestimo)}</td><td>{fmt(r.data_prevista)}</td><td>{fmt(r.data_devolucao)}</td></tr>)}</tbody></table></div>}</div>
}

function Leitores({say}){
  const [h,setH]=useState(null)
  return <Crud title="Leitores" table="leitores" say={say}
    extra={h&&<Historico l={h} onClose={()=>setH(null)}/>}
    actions={r=><button className="b s m" onClick={()=>setH(r)}>Histórico</button>}
    fields={[{k:'nome',label:'Nome completo',req:1},{k:'matricula',label:'Matrícula'},{k:'cpf',label:'CPF'},
      {k:'telefone',label:'Telefone'},{k:'email',label:'E-mail',type:'email'}]}
    cols={[['Nome',r=>r.nome],['Matrícula',r=>r.matricula||'—'],['Telefone',r=>r.telefone||'—'],['E-mail',r=>r.email||'—']]}/>
}

const situ=l=>l.data_devolucao?'Devolvido':dia(l.data_prevista)<hoje()?'Atrasado':'Em andamento'
const Tag=({l})=>{const s=situ(l);return <span className={'tag '+(s==='Devolvido'?'ok':s==='Atrasado'?'late':'run')}>{s}</span>}
const LSEL='*,leitores(nome,matricula),exemplares(codigo,livros(titulo))'

function Emprestimos({say}){
  const [loans,load]=useData('emprestimos',LSEL,'data_emprestimo')
  const [ex]=useData('exemplares','id,codigo,ativo,livros(titulo)','codigo',true)
  const [lei]=useData('leitores','id,nome,matricula','nome',true)
  const vazio={exemplar_id:'',leitor_id:'',data_prevista:mais(14),observacoes:''}
  const [f,setF]=useState(vazio),[ver,setVer]=useState('ativos')
  const busy=new Set(loans.filter(l=>!l.data_devolucao).map(l=>l.exemplar_id))
  const livres=ex.filter(e=>e.ativo&&!busy.has(e.id))
  async function emprestar(e){
    e.preventDefault()
    if(!f.exemplar_id||!f.leitor_id)return say('err','Selecione o exemplar e o leitor.')
    if(f.data_prevista<hoje())return say('err','A data prevista não pode ser anterior a hoje.')
    const {error}=await sb.from('emprestimos').insert({exemplar_id:f.exemplar_id,leitor_id:f.leitor_id,
      data_emprestimo:hoje(),data_prevista:f.data_prevista,data_devolucao:null,observacoes:f.observacoes.trim()||null})
    if(error)return say('err',msg(error))
    say('ok','Empréstimo registrado com sucesso.');setF({...vazio});load()
  }
  async function devolver(l){
    if(!confirm(`Registrar a devolução de "${l.exemplares?.livros?.titulo}"?`))return
    const {error}=await sb.from('emprestimos').update({data_devolucao:hoje()}).eq('id',l.id).is('data_devolucao',null)
    error?say('err',msg(error)):(say('ok','Devolução registrada. Exemplar disponível novamente.'),load())
  }
  const list=loans.filter(l=>ver==='todos'||!l.data_devolucao)
  return <>
    <div className="head"><h1>Empréstimos</h1></div>
    <form className="panel" onSubmit={emprestar}><h3 style={{marginBottom:12}}>Novo empréstimo</h3>
      <div className="grid">
        <div><label>Exemplar disponível *</label><select value={f.exemplar_id} onChange={e=>setF({...f,exemplar_id:e.target.value})}>
          <option value="">Selecione…</option>{livres.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.livros?.titulo}</option>)}</select></div>
        <div><label>Leitor *</label><select value={f.leitor_id} onChange={e=>setF({...f,leitor_id:e.target.value})}>
          <option value="">Selecione…</option>{lei.map(x=><option key={x.id} value={x.id}>{x.nome}{x.matricula?` (${x.matricula})`:''}</option>)}</select></div>
        <div><label>Devolução prevista *</label><input type="date" min={hoje()} value={f.data_prevista} onChange={e=>setF({...f,data_prevista:e.target.value})}/></div>
        <div><label>Observações</label><input value={f.observacoes} onChange={e=>setF({...f,observacoes:e.target.value})}/></div></div>
      <div style={{marginTop:14}}><button className="b p">Registrar empréstimo</button></div></form>
    <div className="bar" style={{marginBottom:10}}>
      <select value={ver} onChange={e=>setVer(e.target.value)}><option value="ativos">Somente ativos</option><option value="todos">Todos</option></select></div>
    <div className="tw"><table><thead><tr><th>Livro</th><th>Código</th><th>Leitor</th><th>Empréstimo</th><th>Previsto</th><th>Devolução</th><th>Situação</th><th></th></tr></thead>
      <tbody>{list.map(l=><tr key={l.id}><td>{l.exemplares?.livros?.titulo}</td><td>{l.exemplares?.codigo}</td><td>{l.leitores?.nome}</td>
        <td>{fmt(l.data_emprestimo)}</td><td>{fmt(l.data_prevista)}</td><td>{fmt(l.data_devolucao)}</td><td><Tag l={l}/></td>
        <td>{!l.data_devolucao&&<button className="b p m" onClick={()=>devolver(l)}>Devolver</button>}</td></tr>)}</tbody></table>
      {!list.length&&<div className="empty">Nenhum empréstimo {ver==='ativos'?'ativo':'registrado'}.</div>}</div></>
}

function Relatorios(){
  const [loans]=useData('emprestimos',LSEL,'data_emprestimo')
  const [s,setS]=useState(''),[de,setDe]=useState(''),[ate,setAte]=useState(''),[q,setQ]=useState('')
  const list=loans.filter(l=>(!s||situ(l)===s)&&(!de||dia(l.data_emprestimo)>=de)&&(!ate||dia(l.data_emprestimo)<=ate)&&
    (!q||(`${l.leitores?.nome} ${l.exemplares?.livros?.titulo} ${l.exemplares?.codigo}`).toLowerCase().includes(q.toLowerCase())))
  const cols=[['Livro',l=>l.exemplares?.livros?.titulo],['Código',l=>l.exemplares?.codigo],['Leitor',l=>l.leitores?.nome],
    ['Empréstimo',l=>fmt(l.data_emprestimo)],['Previsto',l=>fmt(l.data_prevista)],['Devolução',l=>fmt(l.data_devolucao)],['Situação',situ]]
  return <>
    <div className="head"><h1>Relatórios de empréstimos</h1>
      <button className="b p" onClick={()=>exportar('relatorio-emprestimos',cols,list)}>Exportar CSV</button></div>
    <div className="panel grid">
      <div><label>Situação</label><select value={s} onChange={e=>setS(e.target.value)}><option value="">Todas</option>
        <option>Em andamento</option><option>Atrasado</option><option>Devolvido</option></select></div>
      <div><label>Empréstimo a partir de</label><input type="date" value={de} onChange={e=>setDe(e.target.value)}/></div>
      <div><label>Empréstimo até</label><input type="date" value={ate} onChange={e=>setAte(e.target.value)}/></div>
      <div><label>Leitor, livro ou código</label><input value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <p style={{color:'var(--g3)'}}>{list.length} registro(s) encontrado(s).</p>
    <div className="tw"><table><thead><tr>{cols.map(c=><th key={c[0]}>{c[0]}</th>)}</tr></thead>
      <tbody>{list.map(l=><tr key={l.id}>{cols.map(c=><td key={c[0]}>{c[0]==='Situação'?<Tag l={l}/>:c[1](l)}</td>)}</tr>)}</tbody></table>
      {!list.length&&<div className="empty">Nenhum resultado para os filtros selecionados.</div>}</div></>
}

function Painel(){
  const [livros]=useData('livros','id'),[ex]=useData('exemplares','id,ativo'),[emp]=useData('emprestimos','exemplar_id,data_prevista,data_devolucao')
  const ativos=emp.filter(e=>!e.data_devolucao)
  const atras=ativos.filter(e=>dia(e.data_prevista)<hoje()).length
  const disp=Math.max(0,ex.filter(e=>e.ativo).length-ativos.length)
  const C=({n,t,o})=><div className={'card '+(o?'o':'')}><span>{t}</span><b>{n}</b></div>
  return <><div className="head"><h1>Painel</h1></div>
    <div className="cards"><C n={livros.length} t="Títulos cadastrados"/><C n={disp} t="Exemplares disponíveis" o/>
      <C n={ativos.length} t="Exemplares emprestados"/><C n={atras} t="Devoluções atrasadas" o/></div></>
}

function Login({say}){
  const [e,setE]=useState(''),[p,setP]=useState(''),[busy,setB]=useState(false)
  async function go(ev){
    ev.preventDefault();setB(true)
    const {error}=await sb.auth.signInWithPassword({email:e.trim(),password:p})
    setP('');setB(false)
    if(error)say('err',error.message.includes('Invalid login')?'E-mail ou senha incorretos.':msg(error))
  }
  return <div className="login"><form onSubmit={go}><Logo/>
    <h2>Acesso administrativo</h2>
    <div><label>E-mail</label><input type="email" required autoComplete="username" value={e} onChange={x=>setE(x.target.value)}/></div>
    <div><label>Senha</label><input type="password" required autoComplete="current-password" value={p} onChange={x=>setP(x.target.value)}/></div>
    <button className="b p" disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form></div>
}

const PAGES={painel:['Painel',Painel],livros:['Livros',Livros],categorias:['Categorias',Categorias],
  exemplares:['Exemplares',Exemplares],leitores:['Leitores',Leitores],emprestimos:['Empréstimos',Emprestimos],relatorios:['Relatórios',Relatorios]}

export default function App(){
  const [ses,setSes]=useState(undefined),[page,setPage]=useState('painel'),[t,setT]=useState(null)
  const say=(type,text)=>{setT({type,text});setTimeout(()=>setT(null),5000)}
  useEffect(()=>{
    sb.auth.getSession().then(({data})=>setSes(data.session))
    const {data}=sb.auth.onAuthStateChange((_,s)=>setSes(s))
    return()=>data.subscription.unsubscribe()
  },[])
  const autorizada=ses?.user?.email?.toLowerCase()===ADMIN
  useEffect(()=>{if(ses&&!autorizada){sb.auth.signOut();say('err','Acesso restrito à administradora da biblioteca.')}},[ses,autorizada])
  const toast=t&&<div className={'toast '+t.type} role="alert">{t.text}</div>
  if(ses===undefined)return <div className="center">Carregando…</div>
  if(!autorizada)return <><Login say={say}/>{toast}</>
  const Page=PAGES[page][1]
  return <div className="app"><aside><Logo/>
    {Object.entries(PAGES).map(([k,v])=><button key={k} className={'nav'+(k===page?' on':'')} onClick={()=>setPage(k)}>{v[0]}</button>)}
    <button className="nav sair" onClick={()=>sb.auth.signOut()}>Sair</button></aside>
    <main><Page key={page} say={say}/></main>{toast}</div>
}
