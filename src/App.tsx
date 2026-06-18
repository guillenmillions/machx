import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { TEMAS, T18N, MONEDAS, getT } from "./i18n";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// ─── TEXTOS BILINGÜE ──────────────────────────────────────────────────────────
// ─── FÓRMULA DE CÁLCULO (no modificar) ───────────────────────────────────────
function calcular(labor: number, material: number, extras: number, pctGD: number, pctSGV: number, pctMargen: number) {
  const costoDirecto   = labor + material + extras;
  const gastosDirectos = costoDirecto * (pctGD / 100);
  const subtotalGD     = costoDirecto + gastosDirectos;
  const gastosSGV      = subtotalGD * (pctSGV / 100);
  const costoEmpresa   = subtotalGD + gastosSGV;
  const precioVenta    = costoEmpresa / (1 - pctMargen / 100);
  const utilidad       = precioVenta - costoEmpresa;
  const margenReal     = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;
  return { costoDirecto, gastosDirectos, subtotalGD, gastosSGV, costoEmpresa, precioVenta, utilidad, margenReal };
}

function fmtMXN(n: number) {
  return "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneda(n: number, monedaId = "MXN") {
  const m = MONEDAS[monedaId] || MONEDAS.MXN;
  return new Intl.NumberFormat(m.locale, { style: "currency", currency: m.id, minimumFractionDigits: 2 }).format(n || 0);
}

function convertirMoneda(mxnAmount: number, monedaId: string, tc: number) {
  if (monedaId === "MXN") return mxnAmount;
  const tasasVsUSD: Record<string, number> = { USD:1, EUR:0.92, CAD:1.36, COP:3900, ARS:900, BRL:4.97, CLP:920, PEN:3.75, GBP:0.79 };
  const usd = mxnAmount / (tc || 17.5);
  return usd * (tasasVsUSD[monedaId] || 1);
}

// ─── FOLIO CONSECUTIVO ───────────────────────────────────────────────────────
function generarFolio(config: any, cotizaciones: any[]) {
  const anio    = new Date().getFullYear();
  const prefix  = (config?.folioPrefix || "COT").toUpperCase().replace(/\s/g,"");
  // Buscar el número más alto usado este año para no retroceder aunque se borren cots
  let siguiente = config?.folioSiguiente || 1;
  const patronAnio = new RegExp(`^${prefix}-${anio}-(\\d+)$`);
  cotizaciones.forEach((c: any) => {
    const m = (c.folio||"").match(patronAnio);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= siguiente) siguiente = n + 1;
    }
  });
  return `${prefix}-${anio}-${String(siguiente).padStart(4,"0")}`;
}

// ─── TIPO DE CAMBIO AUTOMÁTICO (USD → MXN vía API pública) ───────────────────
async function fetchTipoCambio(): Promise<number> {
  try {
    const res  = await fetch("https://api.frankfurter.app/latest?from=USD&to=MXN");
    const data = await res.json();
    return data?.rates?.MXN || 0;
  } catch { return 0; }
}


// ─── DATOS INICIALES ──────────────────────────────────────────────────────────
const DATOS_INICIALES = {
  taller: {
    nombre:"", telefono:"", email:"", logo:"",
    rfc:"", razonSocial:"", direccionFiscal:"",
  },
  config: { pctGD:35, pctSGV:15, pctMargen:25, tc:17.5, moneda:"MXN", idioma:"es", folioPrefix:"COT", folioSiguiente:1,
    impuestoNombre:"IVA", impuestoPct:16, impuestoActivo:true },
  tema:"claro", fuente:"IBM Plex Sans", tamTexto:"normal", plantillaPDF:"formal",
  materiales: [
    { id:1, nombre:"Acero 1018",           precio:45  },
    { id:2, nombre:"Acero inoxidable 304", precio:120 },
    { id:3, nombre:"Aluminio 6061",        precio:85  },
    { id:4, nombre:"Acero 4140",           precio:58  },
    { id:5, nombre:"Aluminio 7075-T6",     precio:185 },
  ],
  procesos: [
    { id:1, nombre:"Torno CNC",          tarifa:350 },
    { id:2, nombre:"Fresadora CNC",      tarifa:400 },
    { id:3, nombre:"Rectificado",        tarifa:280 },
    { id:4, nombre:"Soldadura TIG",      tarifa:280 },
    { id:5, nombre:"Corte Láser",        tarifa:380 },
  ],
  cotizaciones: [] as any[],
  clientes:     [] as any[],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA DE LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function PantallaLogin({ onLang }: { onLang: (l: string) => void }) {
  const [modo, setModo]     = useState<"login"|"registro"|"reset">("login");
  const [email, setEmail]   = useState("");
  const [password, setPass] = useState("");
  const [cargando, setCarg] = useState(false);
  const [mensaje, setMsg]   = useState<{tipo:string;texto:string}|null>(null);
  const [lang, setLang]     = useState<"es"|"en"|"pt">(() => {
    try { return (localStorage.getItem("cot_lang") as any) || "es"; } catch { return "es"; }
  });
  // Colores hardcodeados — sin dependencia de módulos importados (evita TDZ en Vite)
  const t = { card:"#1a1d27", border:"#2a2d3e", text:"#e8eaf0", textSub:"#8b8fa8",
    accent:"#4f6ef7", success:"#22c55e", danger:"#ef4444", input:"#12151f" };
  const LX: Record<string,any> = {
    es:{sub:"Estándar — Sistema de Cotización Industrial",noAcc:"¿No tienes cuenta?",link:"Adquiere tu licencia aquí →",tab1:"Iniciar sesión",tab2:"Registrarse",em:"Correo electrónico",pw:"Contraseña (mínimo 6 caracteres)",b1:"Entrar",b2:"Crear cuenta",b3:"Enviar enlace",proc:"Procesando...",fgt:"¿Olvidaste tu contraseña?",back:"← Volver",rst:"Ingresa tu correo para recibir el enlace.",ep:"Correo o contraseña incorrectos.",okReg:"¡Cuenta creada! Revisa tu correo.",okRst:"Te enviamos el enlace."},
    en:{sub:"Standard — Industrial Quoting System",noAcc:"Don't have an account?",link:"Get your license here →",tab1:"Sign in",tab2:"Sign up",em:"Email address",pw:"Password (min. 6 characters)",b1:"Sign in",b2:"Create account",b3:"Send link",proc:"Processing...",fgt:"Forgot your password?",back:"← Back",rst:"Enter your email to receive a reset link.",ep:"Incorrect email or password.",okReg:"Account created! Check your email.",okRst:"We sent you a reset link."},
    pt:{sub:"Padrão — Sistema de Cotação Industrial",noAcc:"Não tem uma conta?",link:"Adquira sua licença aqui →",tab1:"Entrar",tab2:"Cadastrar",em:"E-mail",pw:"Senha (mín. 6 caracteres)",b1:"Entrar",b2:"Criar conta",b3:"Enviar link",proc:"Processando...",fgt:"Esqueceu sua senha?",back:"← Voltar",rst:"Digite seu e-mail para receber o link.",ep:"E-mail ou senha incorretos.",okReg:"Conta criada! Verifique seu e-mail.",okRst:"Enviamos o link para seu e-mail."},
  };
  const lx = LX[lang] || LX.es;
  function setL(l:"es"|"en"|"pt"){setLang(l);setMsg(null);try{localStorage.setItem("cot_lang",l);}catch{}}

  async function handleLogin(e: any) {
    e.preventDefault(); setCarg(true); setMsg(null);
    console.log("[LOGIN] lang seleccionado:", lang);
    try {
      localStorage.setItem("cot_lang", lang);
      console.log("[LOGIN] localStorage guardado:", localStorage.getItem("cot_lang"));
    } catch (err) { console.error("[LOGIN] Error guardando:", err); }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("[LOGIN] Despues de Supabase, localStorage:", localStorage.getItem("cot_lang"));
    if (error) { setMsg({ tipo:"error", texto:"Correo o contraseña incorrectos." }); setCarg(false); }
    setCarg(false);
  }
  async function handleRegistro(e: any) {
    e.preventDefault(); setCarg(true); setMsg(null);
    try { localStorage.setItem("cot_lang", lang); } catch {}
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMsg({ tipo:"error", texto: error.message });
    else setMsg({ tipo:"ok", texto:"¡Cuenta creada! Revisa tu correo para confirmar." });
    setCarg(false);
  }
  async function handleReset(e: any) {
    e.preventDefault(); setCarg(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setMsg({ tipo:"error", texto: error.message });
    else setMsg({ tipo:"ok", texto:"Te enviamos un enlace para restablecer tu contraseña." });
    setCarg(false);
  }

  const inp  = { width:"100%", padding:"12px 14px", borderRadius:8, border:`1px solid ${t.border}`, background:t.input, color:t.text, fontSize:15, outline:"none", boxSizing:"border-box" as const };
  const btn  = { width:"100%", padding:"13px", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontSize:16, fontWeight:700, cursor:cargando?"not-allowed":"pointer", opacity:cargando?0.7:1 };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f1117 0%,#1a1d27 50%,#0f1117 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'IBM Plex Sans',sans-serif" }}>
      <div style={{ width:420, background:t.card, borderRadius:16, border:`1px solid ${t.border}`, padding:40 }}>
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12, gap:6 }}>
          {(["es","en","pt"] as const).map(l=>(
            <button key={l} onClick={()=>setL(l)} style={{ padding:"3px 10px", borderRadius:20, border:`1px solid ${lang===l?t.accent:t.border}`, background:lang===l?t.accent:"transparent", color:lang===l?"#fff":t.textSub, cursor:"pointer", fontSize:12, fontWeight:600 }}>
              {l==="es"?"🇲🇽 ES":l==="en"?"🇺🇸 EN":"🇧🇷 PT"}
            </button>
          ))}
        </div>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:56, height:56, borderRadius:14, background:t.accent, marginBottom:16, fontSize:26 }}>⚙️</div>
          <div style={{ fontSize:22, fontWeight:800, color:t.text }}>CotizadorPRO</div>
          <div style={{ fontSize:13, color:t.textSub, marginTop:4 }}>{lx.sub}</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:8, lineHeight:1.5 }}>
            {lx.noAcc}{" "}
            <a href="https://hotmart.com/es/marketplace/productos/cotizadorpro-estandar-sistema-de-cotizacion-para-talleres-de-maquinado/G106237955N" target="_blank" rel="noopener noreferrer" style={{ color:"#60a5fa", textDecoration:"none", fontWeight:600 }}>{lx.link}</a>
          </div>
        </div>
        {modo!=="reset"&&(
          <div style={{ display:"flex", marginBottom:28, background:t.input, borderRadius:8, padding:4 }}>
            {(["login","registro"] as const).map(m=>(
              <button key={m} onClick={()=>{setModo(m);setMsg(null);}} style={{ flex:1, padding:"9px 0", border:"none", borderRadius:6, cursor:"pointer", background:modo===m?t.accent:"transparent", color:modo===m?"#fff":t.textSub, fontWeight:600, fontSize:14 }}>
                {m==="login"?lx.tab1:lx.tab2}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={modo==="login"?handleLogin:modo==="registro"?handleRegistro:handleReset}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {modo==="reset"&&<div style={{ color:t.textSub, fontSize:14 }}>{lx.rst}</div>}
            <input style={inp} type="email" placeholder={lx.em} value={email} onChange={e=>setEmail(e.target.value)} required/>
            {modo!=="reset"&&<input style={inp} type="password" placeholder={lx.pw} value={password} onChange={e=>setPass(e.target.value)} required minLength={6}/>}
            <button type="submit" style={btn} disabled={cargando}>{cargando?lx.proc:modo==="login"?lx.b1:modo==="registro"?lx.b2:lx.b3}</button>
          </div>
        </form>
        {mensaje&&<div style={{ marginTop:16, padding:"10px 14px", borderRadius:8, fontSize:14, background:mensaje.tipo==="ok"?"#14532d33":"#7f1d1d33", color:mensaje.tipo==="ok"?t.success:t.danger, border:`1px solid ${mensaje.tipo==="ok"?t.success:t.danger}` }}>{mensaje.texto}</div>}
        <div style={{ marginTop:20, textAlign:"center", fontSize:13, color:t.textSub }}>
          {modo==="login"&&<span onClick={()=>{setModo("reset");setMsg(null);}} style={{ cursor:"pointer", color:t.accent }}>{lx.fgt}</span>}
          {modo==="reset"&&<span onClick={()=>{setModo("login");setMsg(null);}} style={{ cursor:"pointer", color:t.accent }}>{lx.back}</span>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function CotizadorProEstandar() {
  const [sesion, setSesion]               = useState<any>(null);
  const [cargandoSesion, setCargSesion]   = useState(true);
  const [datos, setDatos]                 = useState<any>(DATOS_INICIALES);
  const [guardando, setGuardando]         = useState(false);
  const [pestana, setPestana]             = useState("cotizar");
  const [notif, setNotif]                 = useState<{msg:string;tipo:"ok"|"error"|"warn"}|null>(null);
  const [cotEnEdicion, setCotEnEdicion]   = useState<any>(null);
    const [_langTick, _setLangTick] = useState(0);
  const idiomaActivo = (() => { try { return localStorage.getItem("cot_lang") || "es"; } catch { return "es"; } })();
  function setIdiomaActivo(l: string) { try { localStorage.setItem("cot_lang", l); } catch {} _setLangTick(t => t+1); }

  function mostrarNotif(msg: string, tipo:"ok"|"error"|"warn"="ok") {
    setNotif({msg,tipo});
    setTimeout(()=>setNotif(null), 3500);
  }

  const [sesionKey, setSesionKey] = useState(0);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSesion(session);
      setCargSesion(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      setSesion(session);
      if (event === "SIGNED_IN") {
        try {
          const lang = localStorage.getItem("cot_lang") || "es";
          setIdiomaActivo(lang);
          setSesionKey(k => k + 1); // fuerza re-render de todos los componentes
        } catch {}
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Cargar datos desde Supabase ───────────────────────────────────────────────
  useEffect(() => {
    if (!sesion) return;
    (async () => {
      const { data, error } = await supabase
        .from("cotizaciones")
        .select("datos")
        .eq("user_id", sesion.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      if (data && !error) {
        setDatos({ ...DATOS_INICIALES, ...data.datos });
      }
    })();
  }, [sesion]);

  // ── Guardar en Supabase (upsert por user_id) ──────────────────────────────────
  const guardarDatos = useCallback(async (nuevosDatos: any) => {
    if (!sesion) return;
    setGuardando(true);
    const payload = { user_id: sesion.user.id, datos: nuevosDatos, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("cotizaciones").upsert(payload, { onConflict: "user_id" });
    if (error) console.error("Error guardando:", error);
    setGuardando(false);
  }, [sesion]);

  const actualizarDatos = useCallback((cambios: any) => {
    setDatos((prev: any) => {
      const nuevo = { ...prev, ...cambios };
      guardarDatos(nuevo);
      return nuevo;
    });
  }, [guardarDatos]);

  async function cerrarSesion() { await supabase.auth.signOut(); }

  if (cargandoSesion) return (
    <div style={{ minHeight:"100vh", background:"#0f1117", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#4f6ef7", fontSize:18, fontFamily:"IBM Plex Sans,sans-serif" }}>Cargando CotizadorPRO…</div>
    </div>
  );

  if (!sesion) return <PantallaLogin onLang={() => {}} />;

  const t        = TEMAS[datos.tema] || TEMAS.oscuro;
  const tamFuente = datos.tamTexto === "chico" ? 13 : datos.tamTexto === "grande" ? 16 : 14;
  const tx = getT(idiomaActivo);

  // ── Edición completa desde Mis Cotizaciones ──────────────────────────────────
  function handleEditarCompleto(cot: any, modo: "mismo"|"nuevo") {
    setCotEnEdicion({ cot, modo });
    setPestana("cotizar");
  }

  return (
    <div style={{ minHeight:"100vh", background:t.bg, color:t.text, fontSize:tamFuente, fontFamily:`'${datos.fuente}',sans-serif` }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${t.bg}; color:${t.text}; font-family:'${datos.fuente}',sans-serif; }
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:${t.bg}} ::-webkit-scrollbar-thumb{background:${t.border};border-radius:3px}
        input,select,textarea{font-family:'${datos.fuente}',sans-serif;}
        @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @media print{header,nav,[data-noprint]{display:none!important}body{background:white!important}.print-doc{max-width:100%!important;border:none!important;box-shadow:none!important}}
      `}</style>

      {/* NOTIFICACIÓN TOAST */}
      {notif && (
        <div style={{
          position:"fixed", top:72, right:20, zIndex:500,
          background: notif.tipo==="ok"?t.success : notif.tipo==="warn"?"#f59e0b":t.danger,
          color:"white", padding:"12px 20px", borderRadius:10,
          boxShadow:"0 4px 20px rgba(0,0,0,0.2)", fontSize:14, fontWeight:600,
          display:"flex", alignItems:"center", gap:10, maxWidth:360,
          animation:"slideIn 0.2s ease",
        }}>
          <span>{notif.tipo==="ok"?"✅":notif.tipo==="warn"?"⚠️":"❌"}</span>
          <span>{notif.msg}</span>
          <button onClick={()=>setNotif(null)} style={{background:"none",border:"none",color:"white",cursor:"pointer",marginLeft:"auto",fontSize:16,lineHeight:1}}>×</button>
        </div>
      )}

      {/* HEADER */}
      <header style={{ background:t.header, borderBottom:`1px solid ${t.border}`, padding:"0 24px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow: datos.tema==="claro"?"0 1px 4px rgba(0,0,0,0.08)":"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {datos.taller.logo
            ? <img src={datos.taller.logo} alt="logo" style={{ height:36, borderRadius:6, objectFit:"contain" }}/>
            : <div style={{ width:36, height:36, borderRadius:8, background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚙️</div>
          }
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:t.text }}>{datos.taller.nombre||"CotizadorPRO"}</div>
            <div style={{ fontSize:11, color:t.textSub }}>Estándar · {sesion.user.email}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {guardando && <span style={{ fontSize:12, color:t.textSub }}>Guardando…</span>}
          <button onClick={cerrarSesion} style={{ padding:"6px 14px", borderRadius:7, border:`1px solid ${t.border}`, background:"transparent", color:t.textSub, cursor:"pointer", fontSize:13 }}>{tx.cerrarSesion||"Cerrar sesión"}</button>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ background:t.card, borderBottom:`1px solid ${t.border}`, padding:"0 24px", display:"flex", gap:4, overflowX:"auto" }}>
        {[
          { id:"cotizar",     label:`📋 ${tx.nuevaCot}`     },
          { id:"lista",       label:`📁 ${tx.misCots}`      },
          { id:"materiales",  label:`🔩 ${tx.materiales}`   },
          { id:"procesos",    label:`⚙️ ${tx.procesos}`     },
          { id:"clientes",    label:"👥 Clientes"           },
          { id:"config",      label:`🎛️ ${tx.configuracion}` },
        ].map(tab => (
          <button key={tab.id} onClick={()=>setPestana(tab.id)} style={{ padding:"14px 16px", border:"none", background:"transparent", cursor:"pointer", color:pestana===tab.id?t.accent:t.textSub, borderBottom:`2px solid ${pestana===tab.id?t.accent:"transparent"}`, fontWeight:pestana===tab.id?700:400, fontSize:tamFuente, fontFamily:`'${datos.fuente}',sans-serif`, whiteSpace:"nowrap" as const }}>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* CONTENIDO */}
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"24px 16px" }}>
        {pestana==="cotizar"    && <PestanaCotizar    key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} cotEnEdicion={cotEnEdicion} onLimpiarEdicion={()=>setCotEnEdicion(null)} mostrarNotif={mostrarNotif} />}
        {pestana==="lista"      && <PestanaLista      key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} onEditarCompleto={handleEditarCompleto} mostrarNotif={mostrarNotif} setPestana={setPestana} />}
        {pestana==="materiales" && <PestanaMateriales key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} />}
        {pestana==="procesos"   && <PestanaProcesos   key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} />}
        {pestana==="clientes"   && <PestanaClientes   key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} mostrarNotif={mostrarNotif} />}
        {pestana==="config"     && <PestanaConfig     key={`${idiomaActivo}-${sesionKey}`} lang={idiomaActivo} datos={datos} actualizarDatos={actualizarDatos} t={t} tamFuente={tamFuente} setIdiomaActivo={setIdiomaActivo} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: NUEVA COTIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaCotizar({ datos, actualizarDatos, t, tamFuente, lang, cotEnEdicion, onLimpiarEdicion, mostrarNotif }: any) {
  const tx = getT(lang);
  const cot = cotEnEdicion?.cot;
  const modoEdicion = cotEnEdicion?.modo; // "mismo" | "nuevo"

  const [clienteNombre,   setClienteNombre]   = useState(cot?.cliente?.nombre||"");
  const [clienteEmpresa,  setClienteEmpresa]  = useState(cot?.cliente?.empresa||"");
  const [clienteEmail,    setClienteEmail]    = useState(cot?.cliente?.email||"");
  const [clienteTel,      setClienteTel]      = useState(cot?.cliente?.tel||"");
  const [clienteCiudad,   setClienteCiudad]   = useState(cot?.cliente?.ciudad||"");
  const [clienteRFC,      setClienteRFC]      = useState(cot?.cliente?.rfc||"");
  const [clienteRazon,    setClienteRazon]    = useState(cot?.cliente?.razonSocial||"");
  const [clienteDirFiscal,setClienteDirFiscal]= useState(cot?.cliente?.direccionFiscal||"");
  const [folio,           setFolio]           = useState(() => {
    if (!cot) return generarFolio(datos.config, datos.cotizaciones||[]);
    if (modoEdicion === "mismo") return cot.folio;
    return generarFolio(datos.config, datos.cotizaciones||[]);
  });
  const [descripcion,     setDescripcion]     = useState(cot?.descripcion||"");
  const [lineas,          setLineas]          = useState<any[]>(cot?.lineas?.map((l:any)=>({...l, id:Date.now()+Math.random()})) || [nuevaLinea()]);
  const [extras,          setExtras]          = useState(cot?.extras||0);
  const [nota,            setNota]            = useState(cot?.nota||"");
  const [entrega,         setEntrega]         = useState(cot?.cond?.entrega||"");
  const [pago,            setPago]            = useState(cot?.cond?.pago||"Anticipo 50% / Liquidación a entrega");
  const [validez,         setValidez]         = useState(cot?.cond?.validez||30);
  const [showVistaCliente,setShowVistaCliente]= useState(false);
  const [showSelectorCli, setShowSelectorCli] = useState(false);
  const [buscaCli,        setBuscaCli]        = useState("");
  const [moneda,          setMoneda]          = useState(cot?.config?.moneda || datos.config?.moneda || "MXN");
  const [tc,              setTc]              = useState(cot?.config?.tc || datos.config?.tc || 17.5);
  const [idioma,          setIdioma]          = useState(cot?.config?.idioma || datos.config?.idioma || "es");

  function nuevaLinea() { return { id: Date.now() + Math.random(), nombrePartida:"", proceso:"", material:"", kg:0, horas:0, cantidad:1 }; }

  const { pctGD, pctSGV, pctMargen } = datos.config;
  let totalLabor = 0, totalMaterial = 0;
  const lineasCalc = lineas.map(l => {
    const proc     = datos.procesos.find((p: any) => p.nombre === l.proceso);
    const mat      = datos.materiales.find((m: any) => m.nombre === l.material);
    const cantidad = l.cantidad || 1;
    const costoLabor    = (proc?.tarifa || 0) * (l.horas || 0) * cantidad;
    const costoMaterial = (mat?.precio  || 0) * (l.kg    || 0) * cantidad;
    totalLabor    += costoLabor;
    totalMaterial += costoMaterial;
    return { ...l, cantidad, labor: costoLabor, costoMat: costoMaterial, subtotal: costoLabor + costoMaterial };
  });
  const res = calcular(totalLabor, totalMaterial, Number(extras)||0, pctGD, pctSGV, pctMargen);

  const txCot = getT(idioma);
  const fmt2  = (n: number) => fmtMoneda(convertirMoneda(n, moneda, tc), moneda);
  const monedaLabel = moneda !== "MXN" ? ` ${moneda}` : " MXN";

  function agregarLinea()                  { setLineas(p => [...p, nuevaLinea()]); }
  function eliminarLinea(id: number)       { setLineas(p => p.filter((l: any) => l.id !== id)); }
  function cambiarLinea(id: number, campo: string, valor: any) { setLineas(p => p.map((l: any) => l.id===id?{...l,[campo]:valor}:l)); }

  function cargarCliente(c: any) {
    setClienteEmpresa(c.empresa||""); setClienteNombre(c.nombre||"");
    setClienteEmail(c.email||"");     setClienteTel(c.tel||"");
    setClienteCiudad(c.ciudad||"");   setClienteRFC(c.rfc||"");
    setClienteRazon(c.razonSocial||""); setClienteDirFiscal(c.direccionFiscal||"");
    setShowSelectorCli(false); setBuscaCli("");
  }

  function guardarClienteEnCatalogo() {
    if (!clienteEmpresa && !clienteNombre) return;
    const clientes = datos.clientes || [];
    const existe   = clientes.find((c: any) => c.empresa?.toLowerCase() === clienteEmpresa.toLowerCase());
    const datosCliente = { empresa:clienteEmpresa, nombre:clienteNombre, email:clienteEmail, tel:clienteTel, ciudad:clienteCiudad, rfc:clienteRFC, razonSocial:clienteRazon, direccionFiscal:clienteDirFiscal };
    let nuevosClientes;
    if (existe) {
      nuevosClientes = clientes.map((c: any) => c.empresa?.toLowerCase()===clienteEmpresa.toLowerCase() ? {...c,...datosCliente} : c);
    } else {
      nuevosClientes = [...clientes, { ...datosCliente, id: Date.now(), creadoEn: new Date().toLocaleDateString("es-MX") }];
    }
    actualizarDatos({ clientes: nuevosClientes });
    mostrarNotif("Cliente guardado en catálogo.", "ok");
  }

  function guardarCotizacion() {
    if (!clienteEmpresa && !clienteNombre) { mostrarNotif("Agrega al menos el nombre o empresa del cliente.", "warn"); return; }
    const nueva = {
      id: (modoEdicion === "mismo" && cot) ? cot.id : Date.now(),
      folio, descripcion,
      fecha: new Date().toLocaleDateString(idioma==="en"?"en-US":"es-MX", {year:"numeric",month:"short",day:"numeric"}),
      cliente: { nombre:clienteNombre, empresa:clienteEmpresa, email:clienteEmail, tel:clienteTel, ciudad:clienteCiudad, rfc:clienteRFC, razonSocial:clienteRazon, direccionFiscal:clienteDirFiscal },
      lineas: lineasCalc, extras: Number(extras)||0, nota,
      cond: { entrega, pago, validez },
      config: { pctGD, pctSGV, pctMargen, moneda, tc, idioma },
      precioVenta: res.precioVenta, utilidad: res.utilidad, margenReal: res.margenReal,
    };

    let nuevasCots: any[];
    let nuevoSiguiente: number;

    if (modoEdicion === "mismo" && cot) {
      // Reemplaza la cotización original, folio no cambia
      nuevasCots = (datos.cotizaciones||[]).map((c: any) => c.id===cot.id ? nueva : c);
      nuevoSiguiente = datos.config?.folioSiguiente || 1;
    } else {
      // Nueva cotización — avanzar contador
      const anio = new Date().getFullYear();
      const prefix = (datos.config?.folioPrefix||"COT").toUpperCase();
      const patronAnio = new RegExp(`^${prefix}-${anio}-(\\d+)$`);
      const m = folio.match(patronAnio);
      const numUsado = m ? parseInt(m[1]) : (datos.config?.folioSiguiente||1);
      nuevoSiguiente = numUsado + 1;
      nuevasCots = [nueva, ...(datos.cotizaciones||[])];
    }

    const configActualizado = { ...datos.config, folioSiguiente: nuevoSiguiente };
    actualizarDatos({ cotizaciones: nuevasCots, config: configActualizado });

    // Limpiar modo edición y preparar siguiente folio
    onLimpiarEdicion?.();
    setFolio(generarFolio(configActualizado, nuevasCots));
    setClienteNombre(""); setClienteEmpresa(""); setClienteEmail(""); setClienteTel(""); setClienteCiudad("");
    setClienteRFC(""); setClienteRazon(""); setClienteDirFiscal("");
    setDescripcion(""); setLineas([nuevaLinea()]); setExtras(0); setNota(""); setEntrega(""); setPago("Anticipo 50% / Liquidación a entrega");
    mostrarNotif(modoEdicion==="mismo" ? "Cotización actualizada correctamente." : "Cotización guardada correctamente.", "ok");
  }

  const card  = { background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:20, marginBottom:20 };
  const inp   = { background:t.input, border:`1px solid ${t.border}`, borderRadius:8, padding:"9px 12px", color:t.text, fontSize:tamFuente, width:"100%", outline:"none" };
  const label = { fontSize:tamFuente-1, color:t.textSub, marginBottom:5, display:"block" };

  if (showVistaCliente) return (
    <VistaPDF
      datos={datos} lineasCalc={lineasCalc} res={res} extras={Number(extras)||0}
      folio={folio} descripcion={descripcion} nota={nota}
      cliente={{ nombre:clienteNombre, empresa:clienteEmpresa, email:clienteEmail, tel:clienteTel, ciudad:clienteCiudad, rfc:clienteRFC, razonSocial:clienteRazon, direccionFiscal:clienteDirFiscal }}
      cond={{ entrega, pago, validez }}
      moneda={moneda} tc={tc} idioma={idioma}
      t={t} onCerrar={()=>setShowVistaCliente(false)}
    />
  );

  return (
    <div>
      {/* Banner modo edición */}
      {cotEnEdicion && (
        <div style={{ background: modoEdicion==="mismo"?"#1e3a5f":"#14532d", borderRadius:10, padding:"12px 18px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", border:`1px solid ${modoEdicion==="mismo"?"#3b82f6":"#22c55e"}` }}>
          <div>
            <span style={{ fontWeight:700, color: modoEdicion==="mismo"?"#60a5fa":"#4ade80", fontSize:13 }}>
              {modoEdicion==="mismo" ? "✏️ Editando cotización existente" : "🆕 Nueva versión basada en cotización existente"}
            </span>
            <span style={{ color:"#94a3b8", fontSize:12, marginLeft:10 }}>
              {modoEdicion==="mismo" ? `Folio: ${cot?.folio} — se reemplazará al guardar` : `Original: ${cot?.folio} → Nueva: ${folio}`}
            </span>
          </div>
          <button onClick={()=>{ onLimpiarEdicion?.(); }} style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:12, padding:"4px 8px", borderRadius:6 }}>
            ✕ Cancelar edición
          </button>
        </div>
      )}

      {/* Selector de cliente */}
      {showSelectorCli && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }} onClick={()=>setShowSelectorCli(false)}>
          <div style={{ background:t.card, borderRadius:14, padding:28, width:520, maxHeight:"80vh", display:"flex", flexDirection:"column", border:`1px solid ${t.border}` }} onClick={(e:any)=>e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:16, color:t.text, marginBottom:14 }}>👥 Seleccionar cliente</div>
            <input style={{ ...inp, marginBottom:12 }} placeholder={tx.phBuscar||"Buscar…"} value={buscaCli} onChange={e=>setBuscaCli(e.target.value)} />
            <div style={{ overflowY:"auto", flex:1 }}>
              {(datos.clientes||[]).length === 0
                ? <div style={{ textAlign:"center", padding:40, color:t.textSub }}>Sin clientes en catálogo. Guarda uno desde esta pantalla.</div>
                : (datos.clientes||[]).filter((c: any) => {
                    const q = buscaCli.toLowerCase();
                    return !q || (c.empresa||"").toLowerCase().includes(q) || (c.nombre||"").toLowerCase().includes(q);
                  }).map((c: any) => (
                    <div key={c.id} onClick={()=>cargarCliente(c)} style={{ padding:"12px 14px", borderRadius:8, border:`1px solid ${t.border}`, marginBottom:8, cursor:"pointer", background:t.input }}>
                      <div style={{ fontWeight:600, color:t.text }}>{c.empresa||"Sin empresa"}</div>
                      {c.nombre && <div style={{ fontSize:12, color:t.textSub }}>{c.nombre}</div>}
                      {c.rfc    && <div style={{ fontSize:11, color:t.textSub }}>RFC: {c.rfc}</div>}
                      {c.ciudad && <div style={{ fontSize:11, color:t.textSub }}>{c.ciudad}</div>}
                    </div>
                  ))
              }
            </div>
            <button onClick={()=>setShowSelectorCli(false)} style={{ marginTop:14, padding:"8px", borderRadius:8, border:`1px solid ${t.border}`, background:"transparent", color:t.textSub, cursor:"pointer" }}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Datos del cliente */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:tamFuente+1 }}>👤 Datos del Cliente</div>
          <button onClick={()=>setShowSelectorCli(true)} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${t.accent}`, background:"transparent", color:t.accent, cursor:"pointer", fontSize:13 }}>
            📋 Cargar del catálogo
          </button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={label}>{tx.empresa||"Empresa *"}</label><input style={inp} value={clienteEmpresa} onChange={e=>setClienteEmpresa(e.target.value)} placeholder={tx.phEmpresa||"Nombre de la empresa"}/></div>
          <div><label style={label}>{tx.contacto||"Contacto"}</label><input style={inp} value={clienteNombre} onChange={e=>setClienteNombre(e.target.value)} placeholder={tx.phContacto||"Nombre del contacto"}/></div>
          <div><label style={label}>{tx.email||"Email"}</label><input style={inp} value={clienteEmail} onChange={e=>setClienteEmail(e.target.value)} placeholder={tx.phEmail||"correo@empresa.com"}/></div>
          <div><label style={label}>{tx.telefono||"Teléfono"}</label><input style={inp} value={clienteTel} onChange={e=>setClienteTel(e.target.value)} placeholder={tx.phTel||"+52 899 000 0000"}/></div>
          <div><label style={label}>{tx.ciudad||"Ciudad"}</label><input style={inp} value={clienteCiudad} onChange={e=>setClienteCiudad(e.target.value)} placeholder="Reynosa, Tamps."/></div>
        </div>
        {/* Datos fiscales */}
        <div style={{ background:t.input, borderRadius:8, padding:14, marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:700, color:t.textSub, textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:10 }}>🏛 Datos Fiscales (opcional)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div><label style={label}>{tx.rfc||"RFC"}</label><input style={inp} value={clienteRFC} onChange={e=>setClienteRFC(e.target.value.toUpperCase())} placeholder={tx.phRFC||"RFC del cliente"}/></div>
            <div><label style={label}>{tx.razonSocial||"Razón Social"}</label><input style={inp} value={clienteRazon} onChange={e=>setClienteRazon(e.target.value)} placeholder={tx.phRazon||"Razón social completa"}/></div>
            <div style={{ gridColumn:"1/-1" }}><label style={label}>{tx.dirFiscal||"Dirección Fiscal"}</label><input style={inp} value={clienteDirFiscal} onChange={e=>setClienteDirFiscal(e.target.value)} placeholder={tx.phDir||"Calle, Colonia, C.P."}/></div>
          </div>
        </div>
        {clienteEmpresa && (
          <button onClick={guardarClienteEnCatalogo} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:`1px solid ${t.success}`, background:"transparent", color:t.success, cursor:"pointer" }}>
            💾 Guardar en catálogo de clientes
          </button>
        )}
      </div>

      {/* Datos de la cotización */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+1, marginBottom:16 }}>📋 Datos de la Cotización</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={label}>Folio</label><input style={inp} value={folio} onChange={e=>setFolio(e.target.value)}/></div>
          <div><label style={label}>Validez</label>
            <select style={inp} value={validez} onChange={e=>setValidez(Number(e.target.value))}>
              {[15,30,60,90].map(d=><option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
          <div><label style={label}>Moneda</label>
            <select style={inp} value={moneda} onChange={e=>setMoneda(e.target.value)}>
              {Object.values(MONEDAS).map(m=><option key={m.id} value={m.id}>{m.flag} {m.id} — {m.label}</option>)}
            </select>
          </div>
          <div><label style={label}>Tiempo de Entrega</label><input style={inp} value={entrega} onChange={e=>setEntrega(e.target.value)} placeholder={tx.phEntrega||"Ej: 10 días hábiles"}/></div>
          <div><label style={label}>Condiciones de Pago</label><input style={inp} value={pago} onChange={e=>setPago(e.target.value)}/></div>
          <div><label style={label}>Idioma del PDF</label>
            <select style={inp} value={idioma} onChange={e=>setIdioma(e.target.value)}>
              <option value="es">🇲🇽 Español</option>
              <option value="en">🇺🇸 English</option>
              <option value="pt">🇧🇷 Português</option>
            </select>
          </div>
          {moneda !== "MXN" && (
            <div><label style={label}>T.C. USD → MXN</label><input type="number" style={inp} value={tc} min={1} step={0.1} onChange={e=>setTc(Number(e.target.value))}/></div>
          )}
          <div style={{ gridColumn:"1/-1" }}><label style={label}>{tx.descTrabajo||"Descripción del trabajo"}</label><input style={inp} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder={tx.phDesc||"Ej: Fabricación..."}/></div>
        </div>
      </div>

      {/* Partidas */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontWeight:700, fontSize:tamFuente+1 }}>🔩 Partidas del trabajo</div>
          <span style={{ fontSize:11, color:t.textSub }}>El nombre de cada partida es lo que verá el cliente en el PDF</span>
        </div>

        <div style={{ display:"flex", flexDirection:"column" as const, gap:10, marginTop:12 }}>
          {lineas.map((l: any, idx: number) => {
            const lc = lineasCalc.find((x:any) => x.id === l.id) || l;
            return (
            <div key={l.id} style={{ border:`1px solid ${t.border}`, borderRadius:10, overflow:"hidden" }}>

              {/* Encabezado de partida — nombre visible para el cliente */}
              <div style={{ background:t.accent, padding:"8px 14px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", minWidth:20 }}>
                  {idx+1}
                </span>
                <input
                  value={l.nombrePartida||""}
                  placeholder={`Ej: Perno M12, Eje de transmisión, Soporte...`}
                  onChange={e=>cambiarLinea(l.id,"nombrePartida",e.target.value)}
                  style={{ flex:1, background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:6, padding:"6px 12px", color:"white", fontSize:tamFuente, fontWeight:700, outline:"none" }}
                />
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.6)", whiteSpace:"nowrap" as const }}>
                  → aparece en PDF del cliente
                </span>
                <button onClick={()=>eliminarLinea(l.id)}
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"white", cursor:"pointer", borderRadius:5, padding:"3px 8px", fontSize:14, lineHeight:1 }}>
                  ×
                </button>
              </div>

              {/* Detalle interno — solo lo ve el taller */}
              <div style={{ padding:"12px 14px", background:t.card }}>
                <div style={{ fontSize:10, fontWeight:700, color:t.textSub, textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:10 }}>
                  Detalle interno del taller
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 2fr 1fr 1fr", gap:10, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:t.textSub, marginBottom:4 }}>Cantidad</div>
                    <input type="number" style={{...inp, fontWeight:700, borderColor:t.accent}} value={l.cantidad||1} min={1} step={1}
                      onChange={e=>cambiarLinea(l.id,"cantidad",parseInt(e.target.value)||1)}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:t.textSub, marginBottom:4 }}>Proceso</div>
                    <select style={inp} value={l.proceso} onChange={e=>cambiarLinea(l.id,"proceso",e.target.value)}>
                      <option value="">Seleccionar proceso…</option>
                      {datos.procesos.map((p: any)=><option key={p.id} value={p.nombre}>{p.nombre} — ${p.tarifa}/hr</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:t.textSub, marginBottom:4 }}>Material</div>
                    <select style={inp} value={l.material} onChange={e=>cambiarLinea(l.id,"material",e.target.value)}>
                      <option value="">Seleccionar material…</option>
                      {datos.materiales.map((m: any)=><option key={m.id} value={m.nombre}>{m.nombre} — ${m.precio}/kg</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:t.textSub, marginBottom:4 }}>Horas c/u</div>
                    <input type="number" style={inp} value={l.horas} min={0} step={0.25}
                      onChange={e=>cambiarLinea(l.id,"horas",parseFloat(e.target.value)||0)}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:t.textSub, marginBottom:4 }}>Kg c/u</div>
                    <input type="number" style={inp} value={l.kg} min={0} step={0.1}
                      onChange={e=>cambiarLinea(l.id,"kg",parseFloat(e.target.value)||0)}/>
                  </div>
                </div>
                {/* Subtotales de la partida */}
                <div style={{ display:"flex", gap:16, fontSize:12, color:t.textSub, borderTop:`1px solid ${t.border}`, paddingTop:8 }}>
                  <span>Labor: <strong style={{ color:t.text }}>{fmtMXN(lc.labor)}</strong></span>
                  <span>Material: <strong style={{ color:t.text }}>{fmtMXN(lc.costoMat)}</strong></span>
                  <span style={{ marginLeft:"auto", fontWeight:700, color:t.text, fontSize:tamFuente }}>
                    Subtotal: {fmtMXN(lc.subtotal)}
                  </span>
                </div>
              </div>

            </div>
            );
          })}
        </div>

        <div style={{ display:"flex", gap:12, marginTop:14, alignItems:"center", flexWrap:"wrap" as const }}>
          <button onClick={agregarLinea} style={{ padding:"9px 18px", borderRadius:8, border:`2px dashed ${t.accent}`, background:"transparent", color:t.accent, cursor:"pointer", fontSize:tamFuente, fontWeight:600 }}>
            + Agregar partida
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
            <label style={{ ...label, margin:0 }}>Extras / Fletes:</label>
            <input type="number" style={{ ...inp, width:130 }} value={extras} min={0}
              onChange={e=>setExtras(Number(e.target.value))}/>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:14, fontSize:tamFuente+1 }}>📊 Desglose de costos (MXN)</div>
          {[
            ["Labor total",               totalLabor],
            ["Material total",            totalMaterial],
            ["Extras / Fletes",           Number(extras)||0],
            ["Costo Directo",             res.costoDirecto],
            [`Gastos Directos (${pctGD}%)`,res.gastosDirectos],
            [`Gastos SGV (${pctSGV}%)`,   res.gastosSGV],
            ["Costo Empresa",             res.costoEmpresa],
          ].map(([k,v])=>(
            <div key={String(k)} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${t.border}`, fontSize:tamFuente }}>
              <span style={{ color:t.textSub }}>{k}</span><span>{fmtMXN(v as number)}</span>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ fontWeight:700, marginBottom:14, fontSize:tamFuente+1 }}>💰 Resultado</div>
          <div style={{ background:t.input, borderRadius:10, padding:20, marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:12, color:t.textSub, marginBottom:4 }}>PRECIO DE VENTA</div>
            <div style={{ fontSize:36, fontWeight:800, color:t.accent }}>{fmt2(res.precioVenta)}</div>
            <div style={{ fontSize:12, color:t.textSub, marginTop:4 }}>{moneda}{moneda!=="MXN"?` · ${fmtMXN(res.precioVenta)} MXN`:""}</div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${t.border}` }}>
            <span style={{ color:t.textSub }}>Utilidad</span><span style={{ color:t.success, fontWeight:700 }}>{fmtMXN(res.utilidad)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${t.border}` }}>
            <span style={{ color:t.textSub }}>Margen real</span><span style={{ color:t.success, fontWeight:700 }}>{res.margenReal.toFixed(1)}%</span>
          </div>
          {datos.config?.impuestoActivo !== false && (
            <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${t.border}` }}>
              <span style={{ color:t.textSub }}>{datos.config?.impuestoNombre||"IVA"} ({datos.config?.impuestoPct||16}%)</span>
              <span style={{ fontWeight:700 }}>{fmt2(res.precioVenta*(datos.config?.impuestoPct||16)/100)}</span>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${t.border}` }}>
            <span style={{ color:t.textSub }}>Total{datos.config?.impuestoActivo!==false?` + ${datos.config?.impuestoNombre||"IVA"}`:""}</span>
            <span style={{ fontWeight:700 }}>{fmt2(datos.config?.impuestoActivo!==false ? res.precioVenta*(1+(datos.config?.impuestoPct||16)/100) : res.precioVenta)}</span>
          </div>
          <div style={{ marginTop:14 }}>
            <label style={label}>Nota para el cliente</label>
            <textarea style={{ ...inp, height:60, resize:"vertical" as const }} value={nota} onChange={e=>setNota(e.target.value)} placeholder={tx.phNota||"Ej: Tiempo de entrega..."}/>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={()=>setShowVistaCliente(true)} style={{ flex:1, padding:"11px 0", borderRadius:8, border:`1px solid ${t.border}`, background:"transparent", color:t.text, cursor:"pointer", fontWeight:600, fontSize:tamFuente }}>
              🖨 Vista / PDF
            </button>
            <button onClick={guardarCotizacion} style={{ flex:2, padding:"11px 0", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontWeight:700, fontSize:tamFuente, cursor:"pointer" }}>
              💾 {txCot.guardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: MIS COTIZACIONES
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaLista({ datos, actualizarDatos, t, tamFuente, lang, onEditarCompleto, mostrarNotif, setPestana }: any) {
  const tx = getT(lang);
  const [showVista,      setShowVista]      = useState<any>(null);
  const [modalEditar,    setModalEditar]    = useState<any>(null); // cotización para modal de opción
  const cots = datos.cotizaciones || [];

  function eliminar(id: number) {
    if (!window.confirm("¿Eliminar esta cotización? Esta acción no se puede deshacer.")) return;
    actualizarDatos({ cotizaciones: cots.filter((c: any) => c.id !== id) });
    mostrarNotif("Cotización eliminada.", "warn");
  }

  if (showVista) return (
    <VistaPDF
      datos={datos} lineasCalc={showVista.lineas} res={calcular(
        showVista.lineas.reduce((s: number, l: any) => s+l.labor, 0),
        showVista.lineas.reduce((s: number, l: any) => s+(l.costoMat||l.subtotal-l.labor||0), 0),
        showVista.extras||0,
        showVista.config?.pctGD||35,
        showVista.config?.pctSGV||15,
        showVista.config?.pctMargen||25,
      )}
      extras={showVista.extras||0}
      folio={showVista.folio} descripcion={showVista.descripcion} nota={showVista.nota}
      cliente={showVista.cliente||{}} cond={showVista.cond||{}}
      moneda={showVista.config?.moneda||"MXN"}
      tc={showVista.config?.tc||17.5}
      idioma={showVista.config?.idioma||"es"}
      t={t} onCerrar={()=>setShowVista(null)}
    />
  );

  if (cots.length === 0) return (
    <div style={{ maxWidth:600, margin:"0 auto", padding:"40px 16px" }}>
      {/* Título */}
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:44, marginBottom:12 }}>👋</div>
        <div style={{ fontSize:22, fontWeight:800, color:t.text, marginBottom:6 }}>
          Bienvenido a CotizadorPRO
        </div>
        <div style={{ fontSize:14, color:t.textSub }}>
          Sigue estos 3 pasos para crear tu primera cotización profesional
        </div>
      </div>

      {/* Pasos */}
      {[
        {
          num:"1", icono:"🏭", titulo:"Configura tu taller",
          desc:"Agrega el nombre, logo, RFC y datos fiscales de tu taller. Aparecerán en todos tus PDFs.",
          tab:"config", btnLabel:"Ir a Configuración",
          listo: !!(datos.taller?.nombre),
        },
        {
          num:"2", icono:"👥", titulo:"Agrega tu primer cliente",
          desc:"Guarda los datos de tus clientes para cargarlos automáticamente al cotizar.",
          tab:"clientes", btnLabel:"Ir a Clientes",
          listo: (datos.clientes||[]).length > 0,
        },
        {
          num:"3", icono:"💰", titulo:"Crea tu primera cotización",
          desc:"Llena los datos del trabajo, agrega las partidas y genera un PDF profesional en segundos.",
          tab:"cotizar", btnLabel:"Nueva Cotización",
          listo: false,
        },
      ].map((paso, i) => (
        <div key={paso.num} style={{
          display:"flex", alignItems:"flex-start", gap:16,
          background: paso.listo ? (t.bg==="white"||t.bg==="#f0f2f5"?"#f0fdf4":t.input) : t.card,
          border:`1px solid ${paso.listo ? t.success+"44" : t.border}`,
          borderRadius:12, padding:"18px 20px", marginBottom:12,
        }}>
          {/* Número / check */}
          <div style={{
            width:40, height:40, borderRadius:"50%", flexShrink:0,
            background: paso.listo ? t.success : t.accent,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize: paso.listo ? 18 : 16, fontWeight:800, color:"white",
          }}>
            {paso.listo ? "✓" : paso.num}
          </div>
          {/* Contenido */}
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:16 }}>{paso.icono}</span>
              <span style={{ fontWeight:700, fontSize:15, color:t.text }}>{paso.titulo}</span>
              {paso.listo && <span style={{ fontSize:11, color:t.success, fontWeight:600, background:t.success+"22", padding:"2px 8px", borderRadius:10 }}>✓ Listo</span>}
            </div>
            <div style={{ fontSize:13, color:t.textSub, lineHeight:1.5, marginBottom:12 }}>
              {paso.desc}
            </div>
            <button
              onClick={()=> setPestana(paso.tab)}
              style={{
                padding:"7px 16px", borderRadius:8, border:`1px solid ${paso.listo?t.success:t.accent}`,
                background:"transparent", color:paso.listo?t.success:t.accent,
                cursor:"pointer", fontSize:13, fontWeight:600,
              }}
            >
              {paso.listo ? "✓ Completado — ver" : `→ ${paso.btnLabel}`}
            </button>
          </div>
        </div>
      ))}

      {/* Tip final */}
      <div style={{ textAlign:"center", marginTop:24, padding:"14px 20px", background:t.input, borderRadius:10, border:`1px solid ${t.border}` }}>
        <span style={{ fontSize:13, color:t.textSub }}>
          💡 <strong style={{ color:t.text }}>Tip:</strong> Tus cotizaciones se guardan automáticamente en la nube. Accede desde cualquier dispositivo.
        </span>
      </div>
    </div>
  );

  return (
    <div>
      {/* Modal de opción de edición */}
      {modalEditar && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}
          onClick={()=>setModalEditar(null)}>
          <div style={{ background:t.card, borderRadius:16, padding:32, width:480, border:`1px solid ${t.border}`, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}
            onClick={(e:any)=>e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:17, color:t.text, marginBottom:6 }}>✏️ Editar cotización</div>
            <div style={{ fontSize:13, color:t.textSub, marginBottom:24 }}>
              Folio actual: <span style={{ fontFamily:"monospace", color:t.accent, fontWeight:700 }}>{modalEditar.folio}</span>
            </div>

            {/* Opción A — Mismo folio */}
            <button onClick={()=>{ onEditarCompleto(modalEditar, "mismo"); setModalEditar(null); }}
              style={{ width:"100%", padding:"16px 20px", borderRadius:10, border:`1px solid ${t.border}`, background:t.input, cursor:"pointer", textAlign:"left" as const, marginBottom:12, display:"block" }}>
              <div style={{ fontWeight:700, color:t.text, fontSize:14, marginBottom:4 }}>
                📝 Editar — mantener folio <span style={{ fontFamily:"monospace", fontSize:12, color:t.accent }}>{modalEditar.folio}</span>
              </div>
              <div style={{ fontSize:12, color:t.textSub }}>
                Modifica procesos, materiales, cliente y condiciones. La cotización original se actualiza. Útil para correcciones.
              </div>
            </button>

            {/* Opción B — Nuevo folio */}
            <button onClick={()=>{ onEditarCompleto(modalEditar, "nuevo"); setModalEditar(null); }}
              style={{ width:"100%", padding:"16px 20px", borderRadius:10, border:`2px solid ${t.accent}`, background:t.input, cursor:"pointer", textAlign:"left" as const, marginBottom:20, display:"block" }}>
              <div style={{ fontWeight:700, color:t.accent, fontSize:14, marginBottom:4 }}>
                🆕 Nueva versión — folio siguiente
              </div>
              <div style={{ fontSize:12, color:t.textSub }}>
                Copia los datos a una cotización nueva con el siguiente folio. La original queda intacta como historial. Útil para revisiones de precio.
              </div>
            </button>

            <button onClick={()=>setModalEditar(null)}
              style={{ width:"100%", padding:"9px", borderRadius:8, border:`1px solid ${t.border}`, background:"transparent", color:t.textSub, cursor:"pointer", fontSize:13 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>📁 {tx.misCots} ({cots.length})</div>
      {cots.map((c: any) => (
        <div key={c.id} style={{ background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:20, marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap" as const, gap:12 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:tamFuente+1, color:t.text }}>{c.folio} — {c.cliente?.empresa||c.cliente||"Sin cliente"}</div>
              {c.cliente?.nombre && <div style={{ color:t.textSub, fontSize:tamFuente-1 }}>Contacto: {c.cliente.nombre}</div>}
              {c.descripcion     && <div style={{ color:t.textSub, fontSize:tamFuente-1, marginTop:4 }}>{c.descripcion}</div>}
              <div style={{ color:t.textSub, fontSize:tamFuente-1, marginTop:2 }}>📅 {c.fecha}</div>
              {c.cond?.entrega   && <div style={{ color:t.textSub, fontSize:tamFuente-1 }}>⏱ {c.cond.entrega}</div>}
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:22, fontWeight:800, color:t.accent }}>{fmtMXN(c.precioVenta)}</div>
              <div style={{ fontSize:12, color:t.success }}>Utilidad: {fmtMXN(c.utilidad)} · {c.margenReal?.toFixed(1)}%</div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:10, flexWrap:"wrap" as const }}>
                <button onClick={()=>setShowVista(c)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${t.border}`, background:"transparent", color:t.textSub, cursor:"pointer", fontSize:12 }}>🖨 PDF</button>
                <button onClick={()=>setModalEditar(c)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${t.accent}`, background:"transparent", color:t.accent, cursor:"pointer", fontSize:12 }}>✏️ Editar</button>
                <button onClick={()=>eliminar(c.id)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${t.danger}`, background:"transparent", color:t.danger, cursor:"pointer", fontSize:12 }}>{tx.eliminar||"Eliminar"}</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// VISTA PDF / CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════
function VistaPDF({ datos, lineasCalc, res, extras, folio, descripcion, nota, cliente, cond, moneda, tc, idioma, t, onCerrar }: any) {
  const txPDF   = getT(idioma);
  const fmt2    = (n: number) => fmtMoneda(convertirMoneda(n, moneda, tc), moneda);
  const mLabel  = moneda !== "MXN" ? moneda : "MXN";
  const tallerNombre = datos.taller?.razonSocial || datos.taller?.nombre || "Taller de Maquinado Industrial";
  const totalVenta   = res.precioVenta;
  const plantilla    = datos.plantillaPDF || "formal";

  const estilosComunes = {
    wrapper: { background:"white", maxWidth:860, margin:"0 auto", padding:"48px 52px", borderRadius:12 } as const,
    tabla: { width:"100%", borderCollapse:"collapse" as const },
    th:    { padding:"9px 12px", textAlign:"left" as const, fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.05em" },
    td:    { padding:"11px 12px", fontSize:13 },
    totalBox: { display:"flex", justifyContent:"space-between", padding:"12px 16px", borderRadius:8, marginTop:8, fontSize:16, fontWeight:800, color:"white" } as const,
  };

  return (
    <div>
      {/* Warning si no hay datos del taller */}
      {!datos.taller?.nombre && (
        <div style={{ background:"#fef3c7", border:"1px solid #f59e0b", borderRadius:8, padding:"10px 16px", marginBottom:16, fontSize:13, color:"#92400e" }} data-noprint>
          ⚠ <strong>Tu taller no tiene datos configurados.</strong> Ve a <strong>{tx.configuracion||"Configuración"} → {tx.datosTaller||"Datos del Taller"}</strong> para agregar nombre, logo y datos fiscales. Aparecerán en este PDF.
        </div>
      )}

      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20, flexWrap:"wrap" as const }} data-noprint>
        <button onClick={onCerrar} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${t.border}`, background:"transparent", color:t.text, cursor:"pointer" }}>← Volver</button>
        <button onClick={()=>window.print()} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:t.accent, color:"#fff", cursor:"pointer", fontWeight:700 }}>🖨 Imprimir / PDF</button>
        <span style={{ fontSize:11, color:t.textSub }}>Plantilla: {plantilla} · {MONEDAS[moneda]?.flag} {moneda} · {idioma==="en"?"English":"Español"}</span>
        {moneda !== "MXN" && <span style={{ fontSize:11, color:t.textSub }}>T.C.: 1 USD = ${tc} MXN</span>}
      </div>

      <div className="print-doc" style={{ ...estilosComunes.wrapper, border: plantilla==="industrial"?"none":"1px solid #e2e8f0", background: plantilla==="industrial"?"#0f1923":"white", color: plantilla==="industrial"?"#e8eaf0":"#1a1d27", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
        {/* ENCABEZADO */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:36, paddingBottom:24, borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"3px solid #1a1d27" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            {datos.taller?.logo && <img src={datos.taller.logo} alt="logo" style={{ height:56, maxWidth:110, objectFit:"contain" }}/>}
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>{tallerNombre}</div>
              {datos.taller?.rfc            && <div style={{ fontSize:11, color: plantilla==="industrial"?"#7DCFB6":"#64748b", marginTop:2 }}>RFC: {datos.taller.rfc}</div>}
              {datos.taller?.direccionFiscal && <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{datos.taller.direccionFiscal}</div>}
              {datos.taller?.telefono        && <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>Tel: {datos.taller.telefono}</div>}
              {datos.taller?.email           && <div style={{ fontSize:12, color:"#94a3b8" }}>Email: {datos.taller.email}</div>}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.5px", color: plantilla==="industrial"?"#f97316":undefined }}>{txPDF.cotizacion}</div>
            <div style={{ marginTop:6, fontSize:14, fontWeight:700, background: plantilla==="industrial"?"#f97316":"#1a1d27", color:"white", padding:"3px 12px", borderRadius:4, display:"inline-block" }}>{folio}</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>Fecha: {new Date().toLocaleDateString("es-MX")} · {txPDF.vigencia}: {cond.validez||30} {txPDF.dias}</div>
            {moneda !== "MXN" && <div style={{ fontSize:11, color:"#f97316", marginTop:2 }}>T.C.: 1 USD = ${tc} MXN</div>}
          </div>
        </div>

        {/* CLIENTE + CONDICIONES */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:28 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:8 }}>{txPDF.cliente}</div>
            <div style={{ fontWeight:700, fontSize:15 }}>{cliente.razonSocial || cliente.empresa || "—"}</div>
            {cliente.rfc            && <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>RFC: {cliente.rfc}</div>}
            {cliente.direccionFiscal && <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{cliente.direccionFiscal}</div>}
            {cliente.nombre         && <div style={{ fontSize:13, color:"#64748b", marginTop:3 }}>{txPDF.attn} {cliente.nombre}</div>}
            {cliente.email          && <div style={{ fontSize:12, color:"#64748b" }}>{cliente.email}</div>}
            {cliente.tel            && <div style={{ fontSize:12, color:"#64748b" }}>{cliente.tel}</div>}
            {cliente.ciudad         && <div style={{ fontSize:12, color:"#64748b" }}>{cliente.ciudad}</div>}
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:8 }}>{txPDF.condiciones}</div>
            <div style={{ fontSize:13, color:"#64748b", lineHeight:1.9 }}>
              ⏱ {txPDF.entrega}: {cond.entrega || txPDF.porConfirmar}<br/>
              💳 {txPDF.pago}: {cond.pago || "—"}<br/>
              📅 {txPDF.vigencia}: {cond.validez||30} {txPDF.dias}
            </div>
          </div>
        </div>

        {/* DESCRIPCIÓN */}
        {descripcion && <div style={{ background: plantilla==="industrial"?"#0D1B2A":"#f8fafc", borderRadius:8, padding:"10px 14px", marginBottom:20, fontSize:13, color:"#64748b" }}><strong>Trabajo: </strong>{descripcion}</div>}

        {/* TABLA — solo lo que ve el cliente */}
        <table style={estilosComunes.tabla}>
          <thead>
            <tr style={{ borderBottom: plantilla==="industrial"?"2px solid #f97316":"2px solid #1a1d27" }}>
              {["#", txPDF.descripcion, txPDF.cant, txPDF.unidad, txPDF.pUnitario, txPDF.total].map((h,i)=>(
                <th key={i} style={{ ...estilosComunes.th,
                  textAlign: i>=4?"right" as const: i===0||i===2?"center" as const:"left" as const,
                  color: plantilla==="industrial"?"#f97316":"#5a6278"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineasCalc.map((l: any, i: number) => {
              // Precio por pieza = subtotal de esta partida (ya incluye labor + material)
              // El precio al cliente es la parte proporcional del precio de venta total
              const pesoPartida = res.precioVenta > 0 ? l.subtotal / (res.costoDirecto||1) : 0;
              const precioClientePartida = res.precioVenta * pesoPartida;
              const nombreMostrar = l.nombrePartida || l.proceso || `Partida ${i+1}`;
              return (
                <tr key={l.id||i} style={{ borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #e8ebf0", background: i%2===0&&plantilla!=="industrial"?"#f7f8fa":"transparent" }}>
                  <td style={{ ...estilosComunes.td, textAlign:"center" as const, color:"#94a3b8", fontWeight:600 }}>{i+1}</td>
                  <td style={estilosComunes.td}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{nombreMostrar}</div>
                  </td>
                  <td style={{ ...estilosComunes.td, textAlign:"center" as const, fontWeight:600 }}>1</td>
                  <td style={{ ...estilosComunes.td, color:"#64748b" }}>pza</td>
                  <td style={{ ...estilosComunes.td, textAlign:"right" as const, color:"#5a6278" }}>{fmt2(precioClientePartida)}</td>
                  <td style={{ ...estilosComunes.td, textAlign:"right" as const, fontWeight:700, fontSize:14 }}>{fmt2(precioClientePartida)}</td>
                </tr>
              );
            })}
            {extras > 0 && (
              <tr style={{ borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #e8ebf0" }}>
                <td style={{ ...estilosComunes.td, textAlign:"center" as const, color:"#94a3b8" }}>+</td>
                <td style={estilosComunes.td}><div style={{ fontWeight:600 }}>Fletes / Servicios adicionales</div></td>
                <td style={{ ...estilosComunes.td, textAlign:"center" as const }}>1</td>
                <td style={{ ...estilosComunes.td, color:"#64748b" }}>—</td>
                <td style={{ ...estilosComunes.td, textAlign:"right" as const }}>{fmt2(extras)}</td>
                <td style={{ ...estilosComunes.td, textAlign:"right" as const, fontWeight:700 }}>{fmt2(extras)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* TOTALES */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16, marginBottom:24 }}>
          <div style={{ width:300 }}>
            {(()=>{
              const impActivo = datos.config?.impuestoActivo !== false;
              const impNombre = datos.config?.impuestoNombre || "IVA";
              const impPct    = datos.config?.impuestoPct ?? 16;
              const impMonto  = impActivo ? totalVenta * impPct / 100 : 0;
              const totalFinal= totalVenta + impMonto;
              return (<>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #f1f5f9", fontSize:13, color:"#64748b" }}>
                  <span>{txPDF.subtotal}</span><span>{fmt2(totalVenta)}</span>
                </div>
                {impActivo && (
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #f1f5f9", fontSize:13, color:"#64748b" }}>
                    <span>{impNombre} ({impPct}%)</span><span>{fmt2(impMonto)}</span>
                  </div>
                )}
                <div style={{ ...estilosComunes.totalBox, background: plantilla==="industrial"?"#f97316":"#1a1d27" }}>
                  <span>TOTAL {mLabel}</span><span>{fmt2(totalFinal)}</span>
                </div>
                {!impActivo && (
                  <div style={{ fontSize:11, color:"#94a3b8", textAlign:"center" as const, marginTop:6 }}>
                    Precio no incluye impuestos — sujeto a régimen fiscal del cliente
                  </div>
                )}
              </>);
            })()}
          </div>
        </div>

        {/* NOTAS */}
        {nota && <div style={{ padding:"12px 16px", background: plantilla==="industrial"?"#0D1B2A":"#f8fafc", borderRadius:8, marginBottom:24, fontSize:13, color:"#64748b" }}><strong style={{ color: plantilla==="industrial"?"#7DCFB6":undefined }}>{txPDF.notas}: </strong>{nota}</div>}

        {/* FIRMAS */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:40, paddingTop:24, borderTop: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #e2e8f0" }}>
          {[txPDF.elaboro, txPDF.autorizo].map(lbl=>(
            <div key={lbl} style={{ textAlign:"center" }}>
              <div style={{ borderBottom: plantilla==="industrial"?"1px solid #1e3a5f":"1px solid #1a1d27", marginBottom:8, height:44 }}/>
              <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"center", color:"#cbd5e1", fontSize:10, marginTop:16 }}>CotizadorPRO Estándar · Sistema de Cotización Industrial</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: CATÁLOGO DE CLIENTES
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaClientes({ datos, actualizarDatos, t, tamFuente, lang, mostrarNotif }: any) {
  const tx = getT(lang);
  const [nuevo, setNuevo]     = useState({ empresa:"", nombre:"", email:"", tel:"", ciudad:"", rfc:"", razonSocial:"", direccionFiscal:"" });
  const [editId, setEditId]   = useState<number|null>(null);
  const [busca, setBusca]     = useState("");
  const clientes = datos.clientes || [];

  const inp   = { background:t.input, border:`1px solid ${t.border}`, borderRadius:8, padding:"9px 12px", color:t.text, fontSize:tamFuente, width:"100%", outline:"none" };
  const label = { fontSize:tamFuente-1, color:t.textSub, marginBottom:4, display:"block" };

  function agregar() {
    if (!nuevo.empresa && !nuevo.nombre) return;
    actualizarDatos({ clientes: [...clientes, { ...nuevo, id:Date.now(), creadoEn:new Date().toLocaleDateString("es-MX") }] });
    setNuevo({ empresa:"", nombre:"", email:"", tel:"", ciudad:"", rfc:"", razonSocial:"", direccionFiscal:"" });
  }

  function eliminar(id: number) {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    actualizarDatos({ clientes: clientes.filter((c: any) => c.id !== id) });
    mostrarNotif("Cliente eliminado.", "warn");
  }

  function guardarEdicion(id: number, datos2: any) {
    actualizarDatos({ clientes: clientes.map((c: any) => c.id===id?{...c,...datos2}:c) });
    setEditId(null);
  }

  const clientesFiltrados = clientes.filter((c: any) => {
    const q = busca.toLowerCase();
    return !q || (c.empresa||"").toLowerCase().includes(q) || (c.nombre||"").toLowerCase().includes(q) || (c.rfc||"").toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Formulario nuevo cliente */}
      <div style={{ background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:24, marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:tamFuente+1, marginBottom:4, color:t.text }}>➕ Agregar cliente al catálogo</div>
        <div style={{ fontSize:12, color:t.textSub, marginBottom:16, padding:"8px 12px", background:t.input, borderRadius:6 }}>
          💡 Los clientes guardados aquí se cargan automáticamente al cotizar — sin volver a escribir sus datos.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={label}>{tx.empresa||"Empresa *"}</label><input style={inp} value={nuevo.empresa} onChange={e=>setNuevo(p=>({...p,empresa:e.target.value}))} placeholder={tx.phEmpresa||"Nombre de la empresa"}/></div>
          <div><label style={label}>{tx.contacto||"Contacto"}</label><input style={inp} value={nuevo.nombre} onChange={e=>setNuevo(p=>({...p,nombre:e.target.value}))} placeholder={tx.phContacto||"Nombre del contacto"}/></div>
          <div><label style={label}>{tx.email||"Email"}</label><input style={inp} value={nuevo.email} onChange={e=>setNuevo(p=>({...p,email:e.target.value}))} placeholder={tx.phEmail||"correo@empresa.com"}/></div>
          <div><label style={label}>{tx.telefono||"Teléfono"}</label><input style={inp} value={nuevo.tel} onChange={e=>setNuevo(p=>({...p,tel:e.target.value}))} placeholder={tx.phTel||"+52 899 000 0000"}/></div>
          <div><label style={label}>{tx.ciudad||"Ciudad"}</label><input style={inp} value={nuevo.ciudad} onChange={e=>setNuevo(p=>({...p,ciudad:e.target.value}))} placeholder={tx.phCiudad||"Ciudad"}/></div>
          <div><label style={label}>{tx.rfc||"RFC"}</label><input style={inp} value={nuevo.rfc} onChange={e=>setNuevo(p=>({...p,rfc:e.target.value.toUpperCase()}))} placeholder={tx.phRFC||"RFC del cliente"}/></div>
          <div><label style={label}>{tx.razonSocial||"Razón Social"}</label><input style={inp} value={nuevo.razonSocial} onChange={e=>setNuevo(p=>({...p,razonSocial:e.target.value}))} placeholder={tx.phRazon||"Razón social completa"}/></div>
          <div><label style={label}>{tx.dirFiscal||"Dirección Fiscal"}</label><input style={inp} value={nuevo.direccionFiscal} onChange={e=>setNuevo(p=>({...p,direccionFiscal:e.target.value}))} placeholder="Calle, Col., C.P., Ciudad"/></div>
        </div>
        <button onClick={agregar} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:tamFuente }}>{tx.agregarCliente||"+ Agregar cliente"}</button>
      </div>

      {/* Lista */}
      <div style={{ background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:tamFuente+1, color:t.text }}>👥 Clientes ({clientes.length})</div>
          <input style={{ ...inp, width:240 }} placeholder={tx.phBuscar||"Buscar…"} value={busca} onChange={e=>setBusca(e.target.value)}/>
        </div>
        {clientesFiltrados.length === 0
          ? <div style={{ textAlign:"center", padding:40, color:t.textSub }}>Sin clientes.</div>
          : clientesFiltrados.map((c: any) => (
              <div key={c.id} style={{ padding:"14px 0", borderBottom:`1px solid ${t.border}` }}>
                {editId === c.id ? (
                  <EditarCliente c={c} t={t} tamFuente={tamFuente} inp={inp} label={label} lang={lang}
                    onGuardar={(d: any)=>guardarEdicion(c.id,d)} onCancelar={()=>setEditId(null)}/>
                ) : (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontWeight:700, color:t.text }}>{c.empresa||"Sin empresa"}</div>
                      {c.nombre && <div style={{ fontSize:12, color:t.textSub }}>{c.nombre}</div>}
                      {c.rfc    && <div style={{ fontSize:11, color:t.textSub }}>RFC: {c.rfc}</div>}
                      {c.email  && <div style={{ fontSize:11, color:t.textSub }}>{c.email}</div>}
                      {c.ciudad && <div style={{ fontSize:11, color:t.textSub }}>{c.ciudad}</div>}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>setEditId(c.id)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${t.accent}`, background:"transparent", color:t.accent, cursor:"pointer", fontSize:12 }}>✏️ Editar</button>
                      <button onClick={()=>eliminar(c.id)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${t.danger}`, background:"transparent", color:t.danger, cursor:"pointer", fontSize:12 }}>{tx.eliminar||"Eliminar"}</button>
                    </div>
                  </div>
                )}
              </div>
            ))
        }
      </div>
    </div>
  );
}

function EditarCliente({ c, t, tamFuente, inp, label, lang, onGuardar, onCancelar }: any) {
  const tx = getT(lang);
  const [d, setD] = useState({ empresa:c.empresa||"", nombre:c.nombre||"", email:c.email||"", tel:c.tel||"", ciudad:c.ciudad||"", rfc:c.rfc||"", razonSocial:c.razonSocial||"", direccionFiscal:c.direccionFiscal||"" });
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <div><label style={label}>Empresa</label><input style={inp} value={d.empresa} onChange={e=>setD(p=>({...p,empresa:e.target.value}))}/></div>
        <div><label style={label}>{tx.contacto||"Contacto"}</label><input style={inp} value={d.nombre} onChange={e=>setD(p=>({...p,nombre:e.target.value}))}/></div>
        <div><label style={label}>{tx.email||"Email"}</label><input style={inp} value={d.email} onChange={e=>setD(p=>({...p,email:e.target.value}))}/></div>
        <div><label style={label}>{tx.telefono||"Teléfono"}</label><input style={inp} value={d.tel} onChange={e=>setD(p=>({...p,tel:e.target.value}))}/></div>
        <div><label style={label}>{tx.ciudad||"Ciudad"}</label><input style={inp} value={d.ciudad} onChange={e=>setD(p=>({...p,ciudad:e.target.value}))}/></div>
        <div><label style={label}>{tx.rfc||"RFC"}</label><input style={inp} value={d.rfc} onChange={e=>setD(p=>({...p,rfc:e.target.value.toUpperCase()}))}/></div>
        <div><label style={label}>{tx.razonSocial||"Razón Social"}</label><input style={inp} value={d.razonSocial} onChange={e=>setD(p=>({...p,razonSocial:e.target.value}))}/></div>
        <div><label style={label}>Dir. Fiscal</label><input style={inp} value={d.direccionFiscal} onChange={e=>setD(p=>({...p,direccionFiscal:e.target.value}))}/></div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>onGuardar(d)} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:tamFuente }}>{tx.guardarBtn||"Guardar"}</button>
        <button onClick={onCancelar} style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${t.border}`, background:"transparent", color:t.textSub, cursor:"pointer", fontSize:tamFuente }}>{tx.cancelar||"Cancelar"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: MATERIALES
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaMateriales({ datos, actualizarDatos, t, tamFuente, lang }: any) {
  const tx = getT(lang);
  const [nuevo, setNuevo] = useState({ nombre:"", precio:"" });
  const inp = { background:t.input, border:`1px solid ${t.border}`, borderRadius:8, padding:"9px 12px", color:t.text, fontSize:tamFuente, width:"100%", outline:"none" };

  function agregar() {
    if (!nuevo.nombre || !nuevo.precio) return;
    actualizarDatos({ materiales: [...datos.materiales, { id:Date.now(), nombre:nuevo.nombre, precio:parseFloat(nuevo.precio) }] });
    setNuevo({ nombre:"", precio:"" });
  }
  function eliminar(id: number) { actualizarDatos({ materiales: datos.materiales.filter((m: any) => m.id !== id) }); }

  return (
    <div style={{ background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:24 }}>
      <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`🔩 ${tx.catalogoMat||"Catálogo de Materiales"}`}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, marginBottom:24 }}>
        <input style={inp} placeholder={tx.nombreMat||"Nombre del material"} value={nuevo.nombre} onChange={e=>setNuevo(p=>({...p,nombre:e.target.value}))}/>
        <input style={inp} type="number" placeholder={tx.precioKg||"Precio por kg"} value={nuevo.precio} onChange={e=>setNuevo(p=>({...p,precio:e.target.value}))}/>
        <button onClick={agregar} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>{tx.agregarBtn||"+ Agregar"}</button>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:tamFuente }}>
        <thead><tr style={{ color:t.textSub }}>
          {["Material","Precio/kg",""].map(h=><th key={h} style={{ padding:"8px 12px", textAlign:"left" as const, borderBottom:`1px solid ${t.border}`, fontWeight:600 }}>{h}</th>)}
        </tr></thead>
        <tbody>{datos.materiales.map((m: any)=>(
          <tr key={m.id}>
            <td style={{ padding:"10px 12px", color:t.text }}>{m.nombre}</td>
            <td style={{ padding:"10px 12px", color:t.text }}>{fmtMXN(m.precio)}/kg</td>
            <td style={{ padding:"10px 12px" }}><button onClick={()=>eliminar(m.id)} style={{ background:"none", border:"none", color:t.danger, cursor:"pointer" }}>{tx.eliminar||"Eliminar"}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: PROCESOS
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaProcesos({ datos, actualizarDatos, t, tamFuente, lang }: any) {
  const tx = getT(lang);
  const [nuevo, setNuevo] = useState({ nombre:"", tarifa:"" });
  const inp = { background:t.input, border:`1px solid ${t.border}`, borderRadius:8, padding:"9px 12px", color:t.text, fontSize:tamFuente, width:"100%", outline:"none" };

  function agregar() {
    if (!nuevo.nombre || !nuevo.tarifa) return;
    actualizarDatos({ procesos: [...datos.procesos, { id:Date.now(), nombre:nuevo.nombre, tarifa:parseFloat(nuevo.tarifa) }] });
    setNuevo({ nombre:"", tarifa:"" });
  }
  function eliminar(id: number) { actualizarDatos({ procesos: datos.procesos.filter((p: any) => p.id !== id) }); }

  return (
    <div style={{ background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:24 }}>
      <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`⚙️ ${tx.catalogoProc||"Catálogo de Procesos"}`}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, marginBottom:24 }}>
        <input style={inp} placeholder={tx.nombreProc||"Nombre del proceso"} value={nuevo.nombre} onChange={e=>setNuevo(p=>({...p,nombre:e.target.value}))}/>
        <input style={inp} type="number" placeholder={tx.tarifaHr||"Tarifa por hora"} value={nuevo.tarifa} onChange={e=>setNuevo(p=>({...p,tarifa:e.target.value}))}/>
        <button onClick={agregar} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:t.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>{tx.agregarBtn||"+ Agregar"}</button>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:tamFuente }}>
        <thead><tr style={{ color:t.textSub }}>
          {["Proceso / Máquina","Tarifa/hr",""].map(h=><th key={h} style={{ padding:"8px 12px", textAlign:"left" as const, borderBottom:`1px solid ${t.border}`, fontWeight:600 }}>{h}</th>)}
        </tr></thead>
        <tbody>{datos.procesos.map((p: any)=>(
          <tr key={p.id}>
            <td style={{ padding:"10px 12px", color:t.text }}>{p.nombre}</td>
            <td style={{ padding:"10px 12px", color:t.text }}>{fmtMXN(p.tarifa)}/hr</td>
            <td style={{ padding:"10px 12px" }}><button onClick={()=>eliminar(p.id)} style={{ background:"none", border:"none", color:t.danger, cursor:"pointer" }}>{tx.eliminar||"Eliminar"}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ─── COMPONENTE: ACTUALIZAR TIPO DE CAMBIO ────────────────────────────────────
function ActualizarTC({ t, tamFuente, tcActual, onActualizar }: any) {
  const [cargando,  setCargando]  = useState(false);
  const [resultado, setResultado] = useState<string|null>(null);
  const [ultimaAct, setUltimaAct] = useState<string|null>(null);

  async function actualizar() {
    setCargando(true); setResultado(null);
    const tc = await fetchTipoCambio();
    if (tc > 0) {
      onActualizar(parseFloat(tc.toFixed(4)));
      setResultado(`✅ TC actualizado: $${tc.toFixed(4)} MXN por 1 USD`);
      setUltimaAct(new Date().toLocaleTimeString("es-MX"));
    } else {
      setResultado("❌ No se pudo obtener el TC. Verifica tu conexión.");
    }
    setCargando(false);
  }

  return (
    <div style={{ background: t.input, borderRadius:8, padding:"12px 16px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" as const }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:t.text }}>Tipo de cambio actual: <span style={{ fontFamily:"monospace", color:t.accent }}>${tcActual.toFixed(4)} MXN / USD</span></div>
        {ultimaAct && <div style={{ fontSize:11, color:t.textSub, marginTop:2 }}>Última actualización: {ultimaAct}</div>}
        {resultado && <div style={{ fontSize:12, color: resultado.startsWith("✅")?t.success:t.danger, marginTop:4 }}>{resultado}</div>}
        <div style={{ fontSize:11, color:t.textSub, marginTop:4 }}>Fuente: frankfurter.app (Banco Central Europeo) · Se aplica a cotizaciones nuevas, no modifica las guardadas.</div>
      </div>
      <button onClick={actualizar} disabled={cargando} style={{ padding:"9px 18px", borderRadius:8, border:`1px solid ${t.accent}`, background:"transparent", color:t.accent, cursor:cargando?"not-allowed":"pointer", fontWeight:700, fontSize:tamFuente, opacity:cargando?0.6:1, whiteSpace:"nowrap" as const }}>
        {cargando ? "⏳ Consultando…" : "🔄 Actualizar TC"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESTAÑA: CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
function PestanaConfig({ datos, actualizarDatos, t, tamFuente, lang, setIdiomaActivo }: any) {
  const tx = getT(lang);
  const inp   = { background:t.input, border:`1px solid ${t.border}`, borderRadius:8, padding:"9px 12px", color:t.text, fontSize:tamFuente, width:"100%", outline:"none" };
  const label = { fontSize:tamFuente-1, color:t.textSub, marginBottom:6, display:"block" };
  const card  = { background:t.card, borderRadius:12, border:`1px solid ${t.border}`, padding:24, marginBottom:20 };

  function subirLogo(e: any) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev: any) => actualizarDatos({ taller:{ ...datos.taller, logo:ev.target.result } });
    reader.readAsDataURL(file);
  }

  return (
    <div>
      {/* Datos del taller */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`🏭 ${tx.datosTaller||"Datos del Taller"}`}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div><label style={label}>{tx.nombreTaller||"Nombre del taller"}</label><input style={inp} value={datos.taller.nombre||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,nombre:e.target.value} })}/></div>
          <div><label style={label}>{tx.telefono||"Teléfono"}</label><input style={inp} value={datos.taller.telefono||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,telefono:e.target.value} })}/></div>
          <div><label style={label}>{tx.email||"Email"}</label><input style={inp} value={datos.taller.email||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,email:e.target.value} })}/></div>
          <div>
            <label style={label}>{tx.logoTaller||"Logo del taller"}</label>
            <input type="file" accept="image/*" onChange={subirLogo} style={{ ...inp, padding:"6px 12px" }}/>
            {datos.taller.logo && <img src={datos.taller.logo} alt="logo" style={{ marginTop:10, height:50, borderRadius:6 }}/>}
          </div>
        </div>
        {/* Datos fiscales del taller */}
        <div style={{ background:t.input, borderRadius:8, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:t.textSub, textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:12 }}>🏛 Datos Fiscales del Taller (aparecen en el PDF)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={label}>{tx.rfcTaller||"RFC del taller"}</label><input style={inp} value={datos.taller.rfc||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,rfc:e.target.value.toUpperCase()} })}/></div>
            <div><label style={label}>{tx.razonSocial||"Razón Social"}</label><input style={inp} value={datos.taller.razonSocial||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,razonSocial:e.target.value} })}/></div>
            <div style={{ gridColumn:"1/-1" }}><label style={label}>{tx.dirFiscal||"Dirección Fiscal"}</label><input style={inp} value={datos.taller.direccionFiscal||""} onChange={e=>actualizarDatos({ taller:{...datos.taller,direccionFiscal:e.target.value} })}/></div>
          </div>
        </div>
      </div>

      {/* Porcentajes */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`📊 ${tx.pctFormula||"Porcentajes de la Fórmula"}`}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {[
            { key:"pctGD",     label:tx.gastosDirectosLabel||tx.gastosDirectosLabel||"Gastos Directos %"    },
            { key:"pctSGV",    label:tx.gastosSGVLabel||tx.gastosSGVLabel||"Gastos SGV %"         },
            { key:"pctMargen", label:tx.margenLabel||tx.margenLabel||"Margen de Utilidad %" },
          ].map(({ key, label:lbl }) => (
            <div key={key}>
              <label style={label}>{lbl}</label>
              <input type="number" style={inp} min={0} max={100}
                value={datos.config[key]}
                onChange={e=>actualizarDatos({ config:{ ...datos.config,[key]:parseFloat(e.target.value)||0 } })}/>
            </div>
          ))}
        </div>
      </div>

      {/* Folio */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`🔢 ${tx.folioCot||"Folio de Cotizaciones"}`}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <div>
            <label style={label}>{tx.prefijoFolio||"Prefijo del folio"}</label>
            <input style={inp} value={datos.config.folioPrefix||"COT"} maxLength={8} placeholder="COT"
              onChange={e=>actualizarDatos({ config:{...datos.config, folioPrefix:e.target.value.toUpperCase().replace(/\s/g,"")} })}/>
            <div style={{ fontSize:11, color:t.textSub, marginTop:4 }}>Ej: COT, FAB, MQ, TALLER01</div>
          </div>
          <div>
            <label style={label}>{tx.siguienteNum||"Siguiente número"}</label>
            <input type="number" style={inp} min={1}
              value={datos.config.folioSiguiente||1}
              onChange={e=>actualizarDatos({ config:{...datos.config, folioSiguiente:parseInt(e.target.value)||1} })}/>
            <div style={{ fontSize:11, color:t.textSub, marginTop:4 }}>{tx.autoIncrementa||"Se incrementa automáticamente"}</div>
          </div>
          <div>
            <label style={label}>Vista previa</label>
            <div style={{ ...inp, color:t.accent, fontWeight:700, fontFamily:"monospace" }}>
              {(datos.config.folioPrefix||"COT").toUpperCase()}-{new Date().getFullYear()}-{String(datos.config.folioSiguiente||1).padStart(4,"0")}
            </div>
          </div>
        </div>
      </div>

      {/* Impuesto */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:6, color:t.text }}>{`🧾 ${tx.impuestoVentas||"Impuesto sobre Ventas"}`}</div>
        <div style={{ fontSize:12, color:t.textSub, marginBottom:16 }}>
          Configura el impuesto según tu país: IVA 16% (México), Sales Tax (EE.UU.), VAT 19% (Alemania), o desactívalo para exportaciones con tasa cero.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:12 }}>
          <div>
            <label style={label}>{tx.nombreImpuesto||"Nombre del impuesto"}</label>
            <input style={inp} placeholder="IVA, Sales Tax, VAT..."
              value={datos.config?.impuestoNombre||"IVA"}
              onChange={e=>actualizarDatos({ config:{...datos.config, impuestoNombre:e.target.value} })}/>
          </div>
          <div>
            <label style={label}>{tx.pctImpuesto||"Porcentaje (%)"}</label>
            <input type="number" style={inp} min={0} max={100} step={0.1}
              value={datos.config?.impuestoPct??16}
              onChange={e=>actualizarDatos({ config:{...datos.config, impuestoPct:parseFloat(e.target.value)||0} })}/>
          </div>
          <div>
            <label style={label}>{tx.mostrarPDF||"Mostrar en PDF"}</label>
            <div style={{ display:"flex", gap:8, marginTop:6 }}>
              {[{v:true,l:"✅ Sí, incluir"},{v:false,l:"❌ No (tasa cero / exento)"}].map(op=>(
                <button key={String(op.v)} onClick={()=>actualizarDatos({ config:{...datos.config, impuestoActivo:op.v} })}
                  style={{ flex:1, padding:"8px 4px", borderRadius:8, border:`1px solid ${(datos.config?.impuestoActivo??true)===op.v?t.accent:t.border}`,
                    background:(datos.config?.impuestoActivo??true)===op.v?t.input:"transparent",
                    color:(datos.config?.impuestoActivo??true)===op.v?t.accent:t.textSub, cursor:"pointer", fontSize:11, fontWeight:600 }}>
                  {op.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize:11, color:t.textSub, background:t.input, padding:"8px 12px", borderRadius:6 }}>
          Ejemplos: México IVA 16% · EE.UU. sin impuesto (B2B con certificado de exención) · Alemania VAT 19% · España IVA 21% · Colombia IVA 19% · Exportación directa: desactivado (tasa cero)
        </div>
      </div>

      {/* Moneda por defecto */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>💱 Moneda y Tipo de Cambio</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:14 }}>
          <div>
            <label style={label}>{tx.monedaDefecto||"Moneda por defecto"}</label>
            <select style={inp} value={datos.config.moneda||"MXN"} onChange={e=>actualizarDatos({ config:{...datos.config,moneda:e.target.value} })}>
              {Object.values(MONEDAS).map(m=><option key={m.id} value={m.id}>{m.flag} {m.id} — {m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>T.C. USD → MXN</label>
            <input type="number" style={inp} min={1} step={0.01} value={datos.config.tc||17.5}
              onChange={e=>actualizarDatos({ config:{...datos.config,tc:parseFloat(e.target.value)||17.5} })}/>
          </div>
          <div>
            <label style={label}>{tx.idiomaSistema||"Idioma del sistema y PDF"}</label>
            <select style={inp} value={datos.config.idioma||"es"} onChange={e=>{ const l=e.target.value; setIdiomaActivo(l); try{localStorage.setItem("cot_lang",l);}catch{} actualizarDatos({ config:{...datos.config,idioma:l} }); }}>
              <option value="es">🇲🇽 Español</option>
              <option value="en">🇺🇸 English</option>
              <option value="pt">🇧🇷 Português</option>
            </select>
          </div>
        </div>
        <ActualizarTC t={t} tamFuente={tamFuente} tcActual={datos.config.tc||17.5}
          onActualizar={(nuevoTC: number) => actualizarDatos({ config:{...datos.config, tc:nuevoTC} })}/>
      </div>

      {/* Apariencia */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:tamFuente+2, marginBottom:20, color:t.text }}>{`🎨 ${tx.apariencia||"Apariencia"}`}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:16 }}>
          <div>
            <label style={label}>{tx.temaColor||"Tema de color"}</label>
            <select style={inp} value={datos.tema} onChange={e=>actualizarDatos({ tema:e.target.value })}>
              <option value="claro">☀️ Claro Profesional (recomendado)</option>
              <option value="oscuro">🌑 Oscuro Industrial</option>
              <option value="marino">🌊 Azul Marino</option>
            </select>
          </div>
          <div>
            <label style={label}>{tx.fuente||"Fuente"}</label>
            <select style={inp} value={datos.fuente} onChange={e=>actualizarDatos({ fuente:e.target.value })}>
              <option>IBM Plex Sans</option>
              <option>Inter</option>
              <option>Roboto</option>
            </select>
          </div>
          <div>
            <label style={label}>{tx.tamTexto||"Tamaño de texto"}</label>
            <select style={inp} value={datos.tamTexto} onChange={e=>actualizarDatos({ tamTexto:e.target.value })}>
              <option value="chico">Chico</option>
              <option value="normal">Normal</option>
              <option value="grande">Grande</option>
            </select>
          </div>
        </div>
        <div>
          <label style={label}>{tx.plantillaPDF||"Plantilla del PDF"}</label>
          <div style={{ display:"flex", gap:10 }}>
            {[
              { id:"formal",     label:"📄 Formal",     desc:"Clásico blanco y negro" },
              { id:"industrial", label:"⚙️ Industrial", desc:"Fondo oscuro, impacto visual" },
            ].map(pl=>(
              <button key={pl.id} onClick={()=>actualizarDatos({ plantillaPDF:pl.id })} style={{ flex:1, padding:"12px", borderRadius:8, border:`2px solid ${datos.plantillaPDF===pl.id?t.accent:t.border}`, background:datos.plantillaPDF===pl.id?t.input:"transparent", cursor:"pointer", textAlign:"left" as const }}>
                <div style={{ fontWeight:700, color:datos.plantillaPDF===pl.id?t.accent:t.text, fontSize:tamFuente }}>{pl.label}</div>
                <div style={{ fontSize:11, color:t.textSub, marginTop:3 }}>{pl.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
