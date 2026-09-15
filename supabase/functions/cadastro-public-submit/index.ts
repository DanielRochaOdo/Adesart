import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { corsHeaders, createServiceClient, getRequestIp, hashSensitiveValue, jsonResponse, normalizeDigits, resolveAttempt, sha256 } from "../_shared/public-flow.ts";

const cpfFmt = (v: string) => normalizeDigits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const dateFmt = (v: string) => { const [y,m,d] = String(v||"").split("-"); return y&&m&&d ? `${d}/${m}/${y}` : v; };
const moneyFmt = (v: number) => Number(v||0).toFixed(2).replace(".", ",");

async function sellerCode(supabase: any, link: any) {
  const direct = Number.parseInt(String(link.vendedorCodigo||""), 10);
  if (direct > 0) return direct;
  for (const id of [link.vendedorId, link.createdBy].filter(Boolean)) {
    const { data } = await supabase.from("profiles").select("external_id").eq("id", id).maybeSingle();
    const code = Number.parseInt(String(data?.external_id||""), 10);
    if (code > 0) return code;
  }
  return 0;
}

async function buildErpPayload(supabase: any, snapshot: any) {
  const c = snapshot.cadastro, l = snapshot.link, vendedor = await sellerCode(supabase, l);
  if (!vendedor) throw new Error("SELLER_CODE_MISSING");
  const contacts = (c.contatos||[]).map((x:any)=>({ tipo:x.tipo==="fixo"?1:x.tipo==="email"?50:x.tipo==="whatsapp"?10:8, dado:x.valor }));
  const rf: Record<string,unknown> = {
    codigoContrato:String(l.empresaCodigo), nome:c.nome, dataNascimento:dateFmt(c.dataNascimento), cpf:cpfFmt(c.cpf), sexo:c.sexoCodigo,
    grupoFaturamento:0, sexoDescricao:c.sexoCodigo===1?"Masculino":"Feminino", identidadeNumero:"123456789", identidadeOrgaoExpeditor:"SSPDS",
    endereco:{ cep:c.endereco.cep, tipoLogradouro:String(c.endereco.idTipoLogradouro||816), logradouro:c.endereco.logradouro, numero:c.endereco.numero,
      complemento:c.endereco.complemento||"N/D", bairro:String(c.endereco.idBairro||1262), municipio:String(c.endereco.idMunicipio||2),
      uf:String(c.endereco.idUf||5), descricaoUf:c.endereco.ufSigla||c.endereco.uf },
    contatoResponsavelFinanceiro:contacts, fl_AlteraSituacao:1, dataApresentacao:new Date().toISOString()
  };
  if (c.numeroMatricula) rf.Matricula = c.numeroMatricula;
  const titular = { tipo:1,nome:c.nome,dataNascimento:dateFmt(c.dataNascimento),cpf:cpfFmt(c.cpf),sexo:c.sexoCodigo,sexoDescricao:c.sexoCodigo===1?"Masculino":"Feminino",plano:c.titularPlano,planoValor:moneyFmt(c.titularPlanoValor),nomeMae:c.nomeMae,carenciaAtendimento:0,funcionarioCadastro:vendedor };
  const deps=(c.dependentes||[]).map((d:any)=>({tipo:d.tipo,nome:d.nome,dataNascimento:dateFmt(d.dataNascimento),cpf:d.cpf?cpfFmt(d.cpf):"",sexo:d.sexo,sexoDescricao:d.sexoDescricao,plano:d.plano,planoValor:moneyFmt(d.planoValor),nomeMae:d.nomeMae,carenciaAtendimento:0,funcionarioCadastro:vendedor}));
  return { dados:{ parceiro:{codigo:vendedor,tipoCobranca:1}, parcelaRetidaComissao:"0", responsavelFinanceiro:rf, dependente:[titular,...deps] }, empresa:String(l.empresaCodigo) };
}

async function erpCreate(payload:any) {
  const token=Deno.env.get("ERP_TOKEN"), url=Deno.env.get("ERP_URL")||"https://odontoart.s4e.com.br/api/vendedor/NovoUsuario2";
  if(!token) throw new Error("ERP_TOKEN not configured");
  const res=await fetch(url,{method:"POST",headers:{token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok || !(data?.dados?.codigo||data?.data?.dados?.codigo)) throw new Error(String(data?.message||data?.mensagem||data?.error||"Erro ao cadastrar no ERP"));
  return data;
}

async function reconcile(snapshot:any) {
  const token=Deno.env.get("ERP_TOKEN"), base=Deno.env.get("ERP_BASE_URL")||"https://odontoart.s4e.com.br";
  if(!token) return null;
  try {
    const cpf=normalizeDigits(snapshot.cadastro.cpf);
    const res=await fetch(`${base}/v2/api/associados?token=${encodeURIComponent(token)}&cpfAssociado=${cpf}&incluirAns=true`,{headers:{Accept:"application/json"}});
    if(!res.ok) return null;
    const raw=await res.json();
    for(const a of Array.isArray(raw?.dados)?raw.dados:[]){
      if(Number(a?.codigoDaEmpresa)!==Number(snapshot.link.empresaCodigo)) continue;
      const titular=(Array.isArray(a?.dependentes)?a.dependentes:[]).find((d:any)=>normalizeDigits(d?.numeroCpfDependente)===cpf&&Number(d?.codigoPlano)===Number(snapshot.cadastro.titularPlano));
      if(titular) return { reconciled:true, dados:{codigo:a.codigo}, source:raw };
    }
  } catch(e){ console.warn("[cadastro-public-submit] reconcile",e); }
  return null;
}

async function makePdf(text:string, acceptance:{acceptedAt:string}) {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,M=48,S=9.5,L=13,MAX=W-M*2;
  const clean=(v:string)=>v.replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,"-").replace(/[^\x09\x0A\x0D\x20-\xFF]/g,"");
  const wrap=(v:string)=>{const out:string[]=[];let line="";for(const w of clean(v).split(/\s+/)){const c=line?`${line} ${w}`:w;if(font.widthOfTextAtSize(c,S)<=MAX)line=c;else{if(line)out.push(line);line=w;}}if(line)out.push(line);return out.length?out:[""];};
  let page=pdf.addPage([W,H]),y=H-M; const ensure=()=>{if(y<M+L*2){page=pdf.addPage([W,H]);y=H-M;}};
  page.drawText("ODONTOART - CONTRATO DE ADESAO",{x:M,y,size:13,font:bold}); y-=24;
  for(const p of clean(text).split("\n")){ensure();if(!p.trim()){y-=L;continue;}for(const line of wrap(p)){ensure();page.drawText(line,{x:M,y,size:S,font});y-=L;}y-=3;}
  y-=8;
  for(const line of wrap(`Aceite eletrônico realizado em ${acceptance.acceptedAt}`)){ensure();page.drawText(line,{x:M,y,size:S,font});y-=L;}
  return new Uint8Array(await pdf.save());
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:200,headers:corsHeaders});
  if(req.method!=="POST")return jsonResponse({error:"Metodo nao permitido"},405);
  try{
    const body=await req.json() as {attemptToken?:string;contractToken?:string;acceptedTerms?:boolean;acceptedData?:boolean};
    if(!body.attemptToken||!body.contractToken||body.acceptedTerms!==true||body.acceptedData!==true)return jsonResponse({error:"O aceite dos termos e a confirmacao dos dados sao obrigatorios"},400);
    const supabase=createServiceClient(), attempt=await resolveAttempt(supabase,body.attemptToken);
    if(!attempt||attempt.status!=="authenticated")return jsonResponse({error:"Sessao expirada"},401);
    const tokenHash=await sha256(body.contractToken.trim());
    const {data:session,error:sErr}=await supabase.from("public_contract_sessions").select("*").eq("attempt_id",attempt.id).eq("contract_token_hash",tokenHash).maybeSingle();
    if(sErr||!session)return jsonResponse({error:"Contrato nao encontrado ou expirado"},404);
    if(["erp_registered","deliveries_pending","completed"].includes(session.status))return jsonResponse({ok:true,cadastroId:session.cadastro_id,state:session.status,message:"Adesao ja processada"});
    if(session.status==="erp_processing")return jsonResponse({ok:true,cadastroId:session.cadastro_id,state:"processing",message:"Sua adesao esta sendo processada"},202);
    if(!["prepared","erp_failed"].includes(session.status))return jsonResponse({error:"Este contrato nao pode mais ser utilizado"},409);

    const previousStatus=session.status, now=new Date().toISOString(), ipHash=await hashSensitiveValue(getRequestIp(req));
    const {data:claimed,error:cErr}=await supabase.from("public_contract_sessions").update({status:"erp_processing",accepted_terms:true,accepted_data:true,accepted_at:session.accepted_at||now,accepted_ip_hash:session.accepted_ip_hash||ipHash,accepted_user_agent:session.accepted_user_agent||req.headers.get("user-agent")||"unknown",updated_at:now}).eq("id",session.id).in("status",["prepared","erp_failed"]).select("*").maybeSingle();
    if(cErr)throw cErr;if(!claimed)return jsonResponse({ok:true,state:"processing",message:"Sua adesao esta sendo processada"},202);
    const snapshot=claimed.snapshot,c=snapshot.cadastro,l=snapshot.link;
    const {data:blocked}=await supabase.rpc("check_public_link_blocked_cpf",{p_cpf:c.cpf});
    if(blocked?.blocked){await supabase.from("public_contract_sessions").update({status:"needs_attention",updated_at:new Date().toISOString()}).eq("id",claimed.id);return jsonResponse({error:"Este CPF ja possui uma adesao concluida",code:"CPF_ALREADY_COMPLETED"},409);}

    const erpPayload=await buildErpPayload(supabase,snapshot); let cadastroId=claimed.cadastro_id as string|null;
    if(!cadastroId){
      const vendedor=await sellerCode(supabase,l);
      const stored=[{tipo:1,nome:c.nome,dataNascimento:c.dataNascimento,cpf:c.cpf,sexo:c.sexoCodigo,sexoDescricao:c.sexoCodigo===1?"Masculino":"Feminino",plano:c.titularPlano,planoValor:moneyFmt(c.titularPlanoValor),nomeMae:c.nomeMae,carenciaAtendimento:0,funcionarioCadastro:vendedor},...(c.dependentes||[]).map((d:any)=>({tipo:d.tipo,nome:d.nome,dataNascimento:d.dataNascimento,cpf:d.cpf,sexo:d.sexo,sexoDescricao:d.sexoDescricao,plano:d.plano,planoValor:moneyFmt(d.planoValor),nomeMae:d.nomeMae,carenciaAtendimento:0,funcionarioCadastro:vendedor}))];
      const {data:created,error:iErr}=await supabase.from("cadastros").insert({status:"incompleto",tipo_cadastro:"cadastro",created_by:l.createdBy,team_id:l.teamId,cpf:c.cpf,nome:c.nome,data_nascimento:c.dataNascimento,sexo:c.sexoCodigo===1?"M":"F",sexo_codigo:c.sexoCodigo,nome_mae:c.nomeMae,contatos:c.contatos,endereco:c.endereco,cliente_sera_usuario:true,empresa_id:l.empresaCodigo,empresa_codigo:l.empresaCodigo,empresa_nome:l.empresaNome,empresa_cnpj:l.empresaCnpj,empresa_raw:{codigo:l.empresaCodigo,nome:l.empresaNome},empresa_exige_matricula:l.empresaExigeMatricula,planos_raw:[{Plano:c.titularPlano,nomeExibicao:c.titularPlanoNome,ValorTitular:c.titularPlanoValor},...(c.dependentes||[]).map((d:any)=>({Plano:d.plano,nomeExibicao:d.planoNome,ValorDependente:d.planoValor}))],dependentes:stored,numero_matricula:c.numeroMatricula||null,vendedor_id:l.vendedorId,vendedor_codigo:String(vendedor),vendedor_nome:l.vendedorNome,origem_link_id:l.id,fluxo_publico:true,payload_erp:erpPayload}).select("id").single();
      if(iErr||!created)throw iErr||new Error("CADASTRO_CREATE_FAILED"); cadastroId=created.id; await supabase.from("public_contract_sessions").update({cadastro_id:cadastroId}).eq("id",claimed.id);
    }

    let erpResult:any=previousStatus==="erp_failed"?await reconcile(snapshot):null;
    if(!erpResult){try{erpResult=await erpCreate(erpPayload);}catch(e){erpResult=await reconcile(snapshot);if(!erpResult){const msg=e instanceof Error?e.message:"Erro ao cadastrar no ERP";await supabase.from("cadastros").update({status:"incompleto",erp_response:{error:msg}}).eq("id",cadastroId);await supabase.from("public_contract_sessions").update({status:"erp_failed",updated_at:new Date().toISOString()}).eq("id",claimed.id);return jsonResponse({error:msg,code:"ERP_SUBMIT_FAILED",cadastroId},502);}}}

    await supabase.from("cadastros").update({status:"enviado",erp_response:erpResult,data_envio:new Date().toISOString()}).eq("id",cadastroId);
    await supabase.from("cadastro_links").update({used_at:new Date().toISOString(),used_cpf:c.cpf,used_cadastro_id:cadastroId}).eq("id",l.id);
    await supabase.from("public_contract_sessions").update({status:"erp_registered",erp_response:erpResult,updated_at:new Date().toISOString()}).eq("id",claimed.id);

    const acceptedAt=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(claimed.accepted_at||now)).replace(",","");
    const pdf=await makePdf(claimed.contract_text,{acceptedAt});
    const pdfHash=await sha256(pdf), path=`${new Date().getUTCFullYear()}/${cadastroId}/contrato-${claimed.id}.pdf`;
    const {error:uErr}=await supabase.storage.from("contracts").upload(path,pdf,{contentType:"application/pdf",upsert:true});
    if(uErr){await supabase.from("public_contract_sessions").update({status:"needs_attention",updated_at:new Date().toISOString()}).eq("id",claimed.id);return jsonResponse({ok:true,cadastroId,warning:"Cadastro concluido no ERP, mas o contrato precisa de reprocessamento."});}
    await supabase.from("public_contract_sessions").update({status:"deliveries_pending",pdf_storage_path:path,pdf_hash:pdfHash,updated_at:new Date().toISOString()}).eq("id",claimed.id);
    const fileName=`Contrato-Odontoart-${cadastroId}.pdf`;
    await supabase.from("contract_delivery_jobs").upsert([{contract_session_id:claimed.id,channel:"email",payload:{email:claimed.confirmed_email,nome:c.nome,storagePath:path,fileName,pdfHash},status:"pending",attempts:0,next_attempt_at:new Date().toISOString()},{contract_session_id:claimed.id,channel:"erp_document",payload:{cpf:c.cpf,empresaCodigo:l.empresaCodigo,storagePath:path,fileName,pdfHash},status:"pending",attempts:0,next_attempt_at:new Date().toISOString()}],{onConflict:"contract_session_id,channel"});
    await supabase.from("public_adesao_attempts").update({status:"completed",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",attempt.id);
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",base=Deno.env.get("SUPABASE_URL")||"";
    const fire=fetch(`${base}/functions/v1/process-contract-deliveries`,{method:"POST",headers:{Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({source:"cadastro-public-submit"})}).catch(e=>console.warn("[cadastro-public-submit] delivery trigger",e));
    const runtime=(globalThis as any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(fire);
    return jsonResponse({ok:true,cadastroId,state:"completed",contractHash:claimed.contract_hash,pdfHash,message:"Adesao concluida com sucesso. O contrato sera enviado ao e-mail confirmado."});
  }catch(error){console.error("[cadastro-public-submit]",error);const msg=error instanceof Error?error.message:"Erro inesperado";if(msg==="SELLER_CODE_MISSING")return jsonResponse({error:"Link sem codigo de vendedor valido"},400);return jsonResponse({error:"Nao foi possivel concluir a adesao",code:"PUBLIC_SUBMIT_FAILED"},500);}
});