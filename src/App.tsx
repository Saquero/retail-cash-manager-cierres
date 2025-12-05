import React, { useEffect, useMemo, useState } from "react";

const DENOMINACIONES = [
  { label: "200 €", value: 200 },
  { label: "100 €", value: 100 },
  { label: "50 €", value: 50 },
  { label: "20 €", value: 20 },
  { label: "10 €", value: 10 },
  { label: "5 €", value: 5 },
  { label: "2 €", value: 2 },
  { label: "1 €", value: 1 },
  { label: "0,50 €", value: 0.5 },
  { label: "0,20 €", value: 0.2 },
  { label: "0,10 €", value: 0.1 },
  { label: "0,05 €", value: 0.05 },
  { label: "0,02 €", value: 0.02 },
  { label: "0,01 €", value: 0.01 },
];

const STORAGE_KEY = "retail-cash-manager-cierres";

// fases lunares
const MOON_PHASES = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

type Cierre = {
  id: string;
  fecha: string;
  isoDate: string;
  totalContado: number;
  ventasEfectivo: number;
  fondoObjetivo: number;
  totalSinVentas: number;
  diferenciaFondo: number;
  cajaCambio: number;
  moonIndex: number;
};

type CalendarCell = {
  day: number | null;
  hasCierre: boolean;
  balanced: boolean | null;
};

// cálculo aproximado de fase lunar real (0–7)
function getMoonPhaseIndex(date: Date): number {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1; // 1-12
  const day = date.getUTCDate();

  if (month < 3) {
    year -= 1;
    month += 12;
  }

  month += 1;
  const c = Math.floor(365.25 * year);
  const e = Math.floor(30.6 * month);
  const jd = c + e + day - 694039.09; // días desde luna nueva ref
  let days = jd / 29.5305882; // ciclo sinódico
  days -= Math.floor(days);
  const phase = Math.round(days * 7);

  return phase & 7;
}

const formatEuro = (value: number) =>
  value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function getCierreDate(c: Cierre): Date | null {
  if (c.isoDate) {
    const d = new Date(c.isoDate);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // fallback por si algún dato viejo no tiene isoDate
  const fechaPart = c.fecha.split(" ")[0];
  const parts = fechaPart.split("/");
  if (parts.length < 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = Number(parts[2]);
  if (year < 100) year += 2000;
  const d2 = new Date(year, month - 1, day);
  if (Number.isNaN(d2.getTime())) return null;
  return d2;
}

function formatMonthKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthKeyToLabel(key: string): string {
  const [yStr, mStr] = key.split("-");
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1;
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return key;
  return `${MONTH_NAMES_ES[monthIndex]} ${year}`;
}

function buildCalendar(monthKey: string, cierres: Cierre[]): CalendarCell[][] {
  const [yStr, mStr] = monthKey.split("-");
  const year = Number(yStr);
  const month = Number(mStr); // 1..12

  if (!year || !month) return [];

  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ day: null, hasCierre: false, balanced: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    let has = false;
    let balanced: boolean | null = null;

    cierres.forEach((c) => {
      const d = getCierreDate(c);
      if (!d) return;
      if (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
      ) {
        has = true;
        const isBalanced = Math.abs(c.diferenciaFondo) < 0.005;
        if (balanced === null) balanced = isBalanced;
        else balanced = balanced && isBalanced;
      }
    });

    cells.push({ day, hasCierre: has, balanced });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}

const App: React.FC = () => {
  const today = new Date();
  const todayDateStr = today.toLocaleDateString("es-ES");
  const todayMoonIndex = getMoonPhaseIndex(today);
  const todayMoon = MOON_PHASES[todayMoonIndex];
  const todayMonthKey = formatMonthKeyFromDate(today);

  const [caja1, setCaja1] = useState<number[]>(
    Array(DENOMINACIONES.length).fill(0)
  );
  const [caja2, setCaja2] = useState<number[]>(
    Array(DENOMINACIONES.length).fill(0)
  );
  const [cajaCambio, setCajaCambio] = useState<number>(0);

  const [ventasEfectivo, setVentasEfectivo] = useState<number>(0);
  const [fondoObjetivo, setFondoObjetivo] = useState<number>(600);

  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(todayMonthKey);
  const [onlyUnbalanced, setOnlyUnbalanced] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCierres(JSON.parse(raw));
    } catch (err) {
      console.error("Error cargando cierres", err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cierres));
    } catch (err) {
      console.error("Error guardando cierres", err);
    }
  }, [cierres]);

  const handleChangeCantidad = (
    setFn: React.Dispatch<React.SetStateAction<number[]>>,
    index: number,
    value: string
  ) => {
    const num = Number(value.replace(",", "."));
    if (Number.isNaN(num) || num < 0) return;
    setFn((prev) => {
      const copy = [...prev];
      copy[index] = num;
      return copy;
    });
  };

  const totalCaja = (arr: number[]) =>
    arr.reduce(
      (acc, unidades, idx) => acc + unidades * DENOMINACIONES[idx].value,
      0
    );

  const totalCaja1 = useMemo(() => totalCaja(caja1), [caja1]);
  const totalCaja2 = useMemo(() => totalCaja(caja2), [caja2]);
  const totalCambio = useMemo(() => cajaCambio || 0, [cajaCambio]);

  const totalContado = useMemo(
    () => totalCaja1 + totalCaja2 + totalCambio,
    [totalCaja1, totalCaja2, totalCambio]
  );

  const totalSinVentas = useMemo(
    () => totalContado - (ventasEfectivo || 0),
    [totalContado, ventasEfectivo]
  );

  const diferenciaFondo = useMemo(
    () => totalSinVentas - (fondoObjetivo || 0),
    [totalSinVentas, fondoObjetivo]
  );

  const mensajeDiferencia = useMemo(() => {
    if (!Number.isFinite(diferenciaFondo)) return "";
    if (Math.abs(diferenciaFondo) < 0.005)
      return "La caja CUADRA con el fondo.";
    if (diferenciaFondo > 0)
      return `SOBRAN ${formatEuro(
        Math.abs(diferenciaFondo)
      )} respecto al fondo.`;
    return `FALTAN ${formatEuro(Math.abs(diferenciaFondo))} respecto al fondo.`;
  }, [diferenciaFondo]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();

    if (cierres.length === 0) {
      set.add(todayMonthKey);
    } else {
      cierres.forEach((c) => {
        const d = getCierreDate(c);
        if (!d) return;
        set.add(formatMonthKeyFromDate(d));
      });
      if (set.size === 0) set.add(todayMonthKey);
    }

    return Array.from(set).sort();
  }, [cierres, todayMonthKey]);

  const filteredCierres = useMemo(
    () =>
      cierres.filter((c) => {
        const d = getCierreDate(c);
        if (!d) return false;
        const key = formatMonthKeyFromDate(d);
        if (key !== selectedMonth) return false;
        if (onlyUnbalanced && Math.abs(c.diferenciaFondo) < 0.005) return false;
        return true;
      }),
    [cierres, selectedMonth, onlyUnbalanced]
  );

  const calendarWeeks = useMemo(
    () => buildCalendar(selectedMonth, cierres),
    [selectedMonth, cierres]
  );

  const guardarCierre = () => {
    const ahora = new Date();
    const fecha = ahora.toLocaleString("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const isoDate = ahora.toISOString().slice(0, 10);

    const nuevo: Cierre = {
      id: `${ahora.getTime()}`,
      fecha,
      isoDate,
      totalContado,
      ventasEfectivo,
      fondoObjetivo,
      totalSinVentas,
      diferenciaFondo,
      cajaCambio,
      moonIndex: todayMoonIndex,
    };

    setCierres((prev) => [nuevo, ...prev]);
    setSelectedMonth(formatMonthKeyFromDate(ahora));
  };

  const limpiarCajas = () => {
    setCaja1(Array(DENOMINACIONES.length).fill(0));
    setCaja2(Array(DENOMINACIONES.length).fill(0));
  };

  const limpiarTodo = () => {
    limpiarCajas();
    setCajaCambio(0);
    setVentasEfectivo(0);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#121212] via-[#1c2520] to-[#0b1410] text-[#1f1f1f]">
      {/* fondo lunar */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-16 top-0 h-56 w-56 rounded-full bg-gradient-to-br from-emerald-300/45 via-emerald-500/25 to-amber-300/40 blur-3xl" />
        <div className="absolute right-[-40px] bottom-[-40px] h-64 w-64 rounded-full bg-gradient-to-tr from-amber-200/50 via-rose-300/25 to-indigo-300/35 blur-3xl" />

        <div className="absolute left-1 sm:left-4 top-10 flex flex-col gap-4 text-4xl sm:text-5xl text-white/55">
          {MOON_PHASES.map((phase, idx) => (
            <span
              key={`left-${idx}`}
              className="drop-shadow-[0_0_12px_rgba(0,0,0,0.45)]"
            >
              {phase}
            </span>
          ))}
        </div>

        <div className="absolute right-1 sm:right-4 bottom-10 flex flex-col gap-4 text-4xl sm:text-5xl text-white/45">
          {MOON_PHASES.map((phase, idx) => (
            <span
              key={`right-${idx}`}
              className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]"
            >
              {phase}
            </span>
          ))}
        </div>
      </div>

      {/* contenido */}
      <div className="relative z-10 flex flex-col items-center py-4 px-2 sm:px-3">
        <div className="w-full max-w-6xl space-y-4 sm:space-y-6">
          {/* header */}
          <header className="rounded-2xl sm:rounded-3xl border border-emerald-900/50 bg-[#F5F1E8]/95 px-4 sm:px-6 py-3 sm:py-4 shadow-lg shadow-emerald-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div>
              <div className="inline-flex items-baseline gap-2">
                <h1 className="text-lg sm:text-2xl font-semibold tracking-[0.12em] uppercase text-[#2F2F2F]">
                  Retail Cash Manager
                </h1>
                <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-emerald-700/10 text-emerald-900 border border-emerald-800/30">
                  Cierre de caja diario
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#5b4a3a] mt-1">
                Aplicación de escritorio para cierre de caja con dos cajas +
                cajón de cambio. Pensada para retail físico y fácil de adaptar a
                otros negocios (más cajas, otras divisas, otros fondos).
              </p>
            </div>
            <div className="text-right text-[10px] sm:text-[11px] text-[#6b5a46]">
              <div className="flex items-center justify-end gap-2">
                <span className="text-2xl sm:text-3xl drop-shadow-[0_0_10px_rgba(0,0,0,0.35)]">
                  {todayMoon}
                </span>
                <div className="flex flex-col items-end leading-tight">
                  <span>{todayDateStr}</span>
                  <span className="italic">Fase lunar aproximada de hoy</span>
                </div>
              </div>
            </div>
          </header>

          {/* configuración del día */}
          <section className="grid md:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/90 p-3 sm:p-4 shadow-md shadow-emerald-900/20">
              <label className="block text-[11px] font-semibold text-[#3a3025] uppercase tracking-wide mb-1">
                Ventas en efectivo del día
              </label>
              <input
                type="number"
                step="0.01"
                value={ventasEfectivo || ""}
                onChange={(e) => setVentasEfectivo(Number(e.target.value))}
                className="w-full rounded-xl border border-emerald-900/30 bg-white/80 px-3 py-1.5 sm:py-2 text-sm text-[#2F2F2F] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                placeholder="Ej: 1822.38"
              />
              <p className="mt-1 text-[10px] sm:text-[11px] text-[#6b5a46]">
                Lo que vas a sacar para ingresar en el banco.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/90 p-3 sm:p-4 shadow-md shadow-emerald-900/20">
              <label className="block text-[11px] font-semibold text-[#3a3025] uppercase tracking-wide mb-1">
                Fondo objetivo (2 cajas + cajón)
              </label>
              <input
                type="number"
                step="0.01"
                value={fondoObjetivo || ""}
                onChange={(e) => setFondoObjetivo(Number(e.target.value))}
                className="w-full rounded-xl border border-emerald-900/30 bg-white/80 px-3 py-1.5 sm:py-2 text-sm text-[#2F2F2F] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                placeholder="Ej: 600"
              />
              <p className="mt-1 text-[10px] sm:text-[11px] text-[#6b5a46]">
                Lo que quieres dejar siempre preparado de fondo. Puedes
                ajustarlo según la política de tu tienda.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/90 p-3 sm:p-4 shadow-md shadow-emerald-900/20">
              <label className="block text-[11px] font-semibold text-[#3a3025] uppercase tracking-wide mb-1">
                Caja de cambio (solo cifra)
              </label>
              <input
                type="number"
                step="0.01"
                value={cajaCambio || ""}
                onChange={(e) => setCajaCambio(Number(e.target.value))}
                className="w-full rounded-xl border border-emerald-900/30 bg-white/80 px-3 py-1.5 sm:py-2 text-sm text-[#2F2F2F] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                placeholder="Ej: 255"
              />
              <p className="mt-1 text-[10px] sm:text-[11px] text-[#6b5a46]">
                Total del cajón de cambio que casi no se toca, pero suma al
                contado.
              </p>
            </div>
          </section>

          {/* tabla de monedas */}
          <section className="rounded-2xl sm:rounded-3xl border border-emerald-900/40 bg-[#F5F1E8]/95 p-3 sm:p-4 shadow-lg shadow-emerald-900/30 overflow-x-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
              <h2 className="text-xs sm:text-sm font-semibold text-[#3a3025] tracking-wide uppercase">
                Detalle de billetes y monedas
              </h2>
              <span className="text-[10px] sm:text-[11px] text-[#6b5a46]">
                Configuración por defecto para EUR. Puedes adaptar las
                denominaciones en el código si trabajas con otra moneda.
              </span>
            </div>
            <table className="w-full text-[11px] sm:text-sm">
              <thead>
                <tr className="text-left text-[#6b5a46] border-b border-emerald-900/30">
                  <th className="py-2">Denominación</th>
                  <th className="py-2 text-center">Caja 1 (unidades)</th>
                  <th className="py-2 text-center">Caja 2 (unidades)</th>
                  <th className="py-2 text-right">Total fila</th>
                </tr>
              </thead>
              <tbody>
                {DENOMINACIONES.map((den, idx) => {
                  const filaTotal = den.value * (caja1[idx] + caja2[idx]);
                  return (
                    <tr
                      key={den.label}
                      className="border-b border-emerald-900/15 last:border-0"
                    >
                      <td className="py-1.5 font-medium text-[#3a3025]">
                        {den.label}
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          value={caja1[idx] || ""}
                          onChange={(e) =>
                            handleChangeCantidad(setCaja1, idx, e.target.value)
                          }
                          className="w-16 sm:w-20 rounded-lg border border-emerald-900/30 bg-white/80 px-2 py-1 text-[10px] sm:text-[11px] text-center text-[#2F2F2F] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          value={caja2[idx] || ""}
                          onChange={(e) =>
                            handleChangeCantidad(setCaja2, idx, e.target.value)
                          }
                          className="w-16 sm:w-20 rounded-lg border border-emerald-900/30 bg-white/80 px-2 py-1 text-[10px] sm:text-[11px] text-center text-[#2F2F2F] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                        />
                      </td>
                      <td className="py-1.5 text-right text-[#3a3025]">
                        {formatEuro(filaTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* resumen + acciones */}
          <section className="grid lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/95 p-3 sm:p-4 shadow-md shadow-emerald-900/30 space-y-1">
              <h3 className="text-[11px] font-semibold text-[#3a3025] tracking-wide uppercase mb-1">
                Resumen por caja
              </h3>
              <p className="text-sm text-[#3a3025]">
                Caja 1:{" "}
                <span className="font-semibold">{formatEuro(totalCaja1)}</span>
              </p>
              <p className="text-sm text-[#3a3025]">
                Caja 2:{" "}
                <span className="font-semibold">{formatEuro(totalCaja2)}</span>
              </p>
              <p className="text-sm text-[#3a3025]">
                Cajón de cambio:{" "}
                <span className="font-semibold">{formatEuro(totalCambio)}</span>
              </p>
              <hr className="border-emerald-900/20 my-2" />
              <p className="text-sm text-[#3a3025]">
                Total contado:{" "}
                <span className="font-semibold">
                  {formatEuro(totalContado)}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/95 p-3 sm:p-4 shadow-md shadow-emerald-900/30 space-y-1">
              <h3 className="text-[11px] font-semibold text-[#3a3025] tracking-wide uppercase mb-1">
                Ventas y fondo
              </h3>
              <p className="text-sm text-[#3a3025]">
                Ventas efectivo:{" "}
                <span className="font-semibold">
                  {formatEuro(ventasEfectivo || 0)}
                </span>
              </p>
              <p className="text-sm text-[#3a3025]">
                Total - ventas:{" "}
                <span className="font-semibold">
                  {formatEuro(totalSinVentas || 0)}
                </span>
              </p>
              <p className="text-sm text-[#3a3025]">
                Fondo objetivo:{" "}
                <span className="font-semibold">
                  {formatEuro(fondoObjetivo || 0)}
                </span>
              </p>
              <p className="text-sm mt-1 text-[#3a3025]">
                Diferencia fondo:{" "}
                <span
                  className={`font-semibold ${
                    Math.abs(diferenciaFondo) < 0.005
                      ? "text-emerald-700"
                      : diferenciaFondo > 0
                      ? "text-amber-600"
                      : "text-rose-600"
                  }`}
                >
                  {formatEuro(diferenciaFondo || 0)}
                </span>
              </p>
              <p className="text-[10px] sm:text-[11px] text-[#6b5a46] mt-1">
                {mensajeDiferencia}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-900/40 bg-[#F5F1E8]/95 p-3 sm:p-4 shadow-md shadow-emerald-900/30 flex flex-col gap-2 sm:gap-3">
              <button
                onClick={guardarCierre}
                className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-600 text-[#F5F1E8] font-semibold py-1.5 sm:py-2 text-sm transition-colors shadow-md shadow-emerald-900/40"
              >
                Guardar cierre de hoy
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={limpiarCajas}
                  className="rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-900/40 text-[11px] py-1.5 transition-colors"
                >
                  Limpiar solo cajas
                </button>
                <button
                  onClick={limpiarTodo}
                  className="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-900/40 text-[11px] py-1.5 transition-colors"
                >
                  Limpiar todo
                </button>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#6b5a46]">
                Los cierres se guardan en este ordenador (localStorage). Si tu
                tienda usa varias cajas o equipos, puedes extenderlo para
                sincronizarse con una API o base de datos central.
              </p>
            </div>
          </section>

          {/* filtros + calendario + histórico */}
          <section className="rounded-2xl sm:rounded-3xl border border-emerald-900/40 bg-[#F5F1E8]/95 p-3 sm:p-4 shadow-lg shadow-emerald-900/30 mb-3 sm:mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="text-[11px] sm:text-sm font-semibold text-[#3a3025] tracking-wide uppercase">
                Histórico de cierres
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#6b5a46]">Mes:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-emerald-900/40 bg-white/90 px-2 py-1 text-[11px] text-[#2F2F2F] focus:outline-none focus:ring-1 focus:ring-emerald-500/80"
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {monthKeyToLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#6b5a46] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyUnbalanced}
                    onChange={(e) => setOnlyUnbalanced(e.target.checked)}
                    className="h-3 w-3 rounded border-emerald-900/50 text-emerald-700"
                  />
                  Ver solo días que no cuadraron
                </label>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr,1.4fr] gap-3 sm:gap-4">
              {/* calendario */}
              <div className="rounded-2xl border border-emerald-900/30 bg-white/80 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#3a3025]">
                    Calendario del mes
                  </span>
                  <span className="text-[10px] text-[#6b5a46]">
                    {monthKeyToLabel(selectedMonth)}
                  </span>
                </div>
                <table className="w-full text-[10px] sm:text-[11px]">
                  <thead>
                    <tr className="text-[#6b5a46]">
                      {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
                        <th key={d} className="py-1 text-center">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calendarWeeks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-4 text-center text-[10px] text-[#6b5a46]"
                        >
                          Sin datos todavía para este mes.
                        </td>
                      </tr>
                    ) : (
                      calendarWeeks.map((week, idx) => (
                        <tr key={idx}>
                          {week.map((cell, i) => {
                            if (cell.day === null) {
                              return <td key={i} className="h-7 sm:h-8" />;
                            }
                            const baseClasses =
                              "mx-auto flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[10px] sm:text-[11px]";
                            let stateClasses =
                              "text-[#3a3025] border border-transparent";
                            if (cell.hasCierre) {
                              if (cell.balanced === false) {
                                stateClasses =
                                  "bg-rose-100 text-rose-900 border border-rose-300";
                              } else if (cell.balanced === true) {
                                stateClasses =
                                  "bg-emerald-100 text-emerald-900 border border-emerald-300";
                              } else {
                                stateClasses =
                                  "bg-amber-50 text-amber-900 border border-amber-200";
                              }
                            } else {
                              stateClasses =
                                "text-[#6b5a46] border border-emerald-900/10 bg-white/60";
                            }

                            return (
                              <td
                                key={i}
                                className="py-1 text-center align-middle"
                              >
                                <div
                                  className={baseClasses + " " + stateClasses}
                                >
                                  {cell.day}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap gap-2 justify-center">
                  <span className="flex items-center gap-1 text-[9px] text-[#6b5a46]">
                    <span className="inline-block h-3 w-3 rounded-full bg-emerald-100 border border-emerald-300" />
                    Cuadra
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-[#6b5a46]">
                    <span className="inline-block h-3 w-3 rounded-full bg-rose-100 border border-rose-300" />
                    No cuadra
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-[#6b5a46]">
                    <span className="inline-block h-3 w-3 rounded-full bg-white/60 border border-emerald-900/10" />
                    Sin cierre
                  </span>
                </div>
              </div>

              {/* tabla histórico */}
              <div className="rounded-2xl border border-emerald-900/30 bg-white/80 p-3">
                {filteredCierres.length === 0 ? (
                  <p className="text-[10px] sm:text-[11px] text-[#6b5a46]">
                    No hay cierres para este mes con el filtro actual.
                  </p>
                ) : (
                  <div className="max-h-48 sm:max-h-64 overflow-y-auto rounded-xl border border-emerald-900/20 bg-white/70">
                    <table className="w-full text-[10px] sm:text-[11px]">
                      <thead className="bg-emerald-900/5 text-[#3a3025]">
                        <tr className="border-b border-emerald-900/20">
                          <th className="py-1.5 px-2 text-left">Fecha</th>
                          <th className="py-1.5 px-2 text-center">Luna</th>
                          <th className="py-1.5 px-2 text-right">
                            Total contado
                          </th>
                          <th className="py-1.5 px-2 text-right">
                            Ventas efectivo
                          </th>
                          <th className="py-1.5 px-2 text-right">
                            Total - ventas
                          </th>
                          <th className="py-1.5 px-2 text-right">
                            Fondo objetivo
                          </th>
                          <th className="py-1.5 px-2 text-right">
                            Cajón cambio
                          </th>
                          <th className="py-1.5 px-2 text-right">Dif. fondo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCierres.map((c) => {
                          const moonEmoji =
                            MOON_PHASES[c.moonIndex] ?? MOON_PHASES[0];
                          return (
                            <tr
                              key={c.id}
                              className="border-b border-emerald-900/10 last:border-0"
                            >
                              <td className="py-1.5 px-2 text-[#3a3025]">
                                {c.fecha}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <span className="text-lg">{moonEmoji}</span>
                              </td>
                              <td className="py-1.5 px-2 text-right text-[#3a3025]">
                                {formatEuro(c.totalContado)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-[#3a3025]">
                                {formatEuro(c.ventasEfectivo)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-[#3a3025]">
                                {formatEuro(c.totalSinVentas)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-[#3a3025]">
                                {formatEuro(c.fondoObjetivo)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-[#3a3025]">
                                {formatEuro(c.cajaCambio)}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right font-semibold ${
                                  Math.abs(c.diferenciaFondo) < 0.005
                                    ? "text-emerald-700"
                                    : c.diferenciaFondo > 0
                                    ? "text-amber-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {formatEuro(c.diferenciaFondo)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 text-[10px] sm:text-[11px] text-[#6b5a46] text-center">
              Este proyecto está pensado como base reusable: puedes duplicar la
              lógica de Caja 2 para añadir una tercera caja, cambiar el fondo
              objetivo por tienda o sincronizar los cierres con un backend si lo
              necesitas.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default App;
