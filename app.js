/* Shekelsplash — SHFL Lottery EV Calculator */
/* global HISTORY_DATA */

(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────
  const N = 62617698; // C(55,5) * 18
  const DIV_COMBOS = [1, 17, 250, 4250, 12250, 208250, 196000, 1151500, 2118760];
  const STD_COST = 0.25;
  const PP_COST = 4.0;
  const SHFL_PER_TICKET = 50;
  const SINGLES_TO_POOL_PCT = 0.85;
  const TOTAL_MAIN_COMBOS = 3478761; // C(55,5)

  const DIV_NAMES = [
    "Div 1 — 5+PB (Jackpot)",
    "Div 2 — 5 main",
    "Div 3 — 4+PB",
    "Div 4 — 4 main",
    "Div 5 — 3+PB",
    "Div 6 — 3 main",
    "Div 7 — 2+PB",
    "Div 8 — 1+PB",
    "Div 9 — PB only"
  ];

  const DIV_SHORT = ["5+PB", "5", "4+PB", "4", "3+PB", "3", "2+PB", "1+PB", "PB"];

  // Defaults
  const DEFAULT_POOLS = [
    1083204.01, 37536.70375, 21437.76, 24117.47,
    18758.04, 16078.32, 13398.60, 26797.19, 29476.91
  ];

  const DEFAULT_PARTICIPATION = {
    shflPrice: 0.2709,
    shflStaked: 226795050,
    othersStd: 50000,
    othersPP: 5000
  };

  const DEFAULT_MY = {
    myStd: 0,
    myPP: 0,
    myShfl: 0
  };

  // ── Combinatorics ─────────────────────────────────────────────────
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < Math.min(k, n - k); i++) {
      result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
  }

  // Precompute P(k) for powerplay
  function computePk() {
    const pk = [];
    for (let k = 0; k <= 5; k++) {
      pk[k] = comb(5, k) * comb(50, 5 - k) / TOTAL_MAIN_COMBOS;
    }
    return pk;
  }

  const P_K = computePk();

  // k → division mapping: [pbIndex, noPbIndex] (-1 = none)
  const K_TO_DIV = [
    [8, -1], // k=0: PB=Div9(idx8), noPB=none
    [7, -1], // k=1: PB=Div8(idx7), noPB=none
    [6, -1], // k=2: PB=Div7(idx6), noPB=none
    [4, 5],  // k=3: PB=Div5(idx4), noPB=Div6(idx5)
    [2, 3],  // k=4: PB=Div3(idx2), noPB=Div4(idx3)
    [0, 1]   // k=5: PB=Div1(idx0), noPB=Div2(idx1)
  ];

  // ── State ─────────────────────────────────────────────────────────
  let state = {
    pools: [...DEFAULT_POOLS],
    participation: { ...DEFAULT_PARTICIPATION },
    my: { ...DEFAULT_MY }
  };

  // ── Calculation Engine ────────────────────────────────────────────
  function calculate(s) {
    const pools = s.pools;
    const { shflPrice, shflStaked, othersStd, othersPP } = s.participation;
    const { myStd, myPP, myShfl } = s.my;

    const totalPool = pools.reduce((a, b) => a + b, 0);

    // My tickets contribute to pool
    const myPoolAdd = SINGLES_TO_POOL_PCT * (myStd * STD_COST + myPP * PP_COST);

    // Adjusted pools
    const adjPools = pools.map(p =>
      totalPool > 0 ? p + myPoolAdd * (p / totalPool) : p
    );

    const adjTotalPool = adjPools.reduce((a, b) => a + b, 0);

    // Others' combos
    const stakedTickets = shflStaked / SHFL_PER_TICKET;
    const othersCombos = stakedTickets + othersStd + othersPP * 18;

    // My combos
    const myStakedTickets = myShfl / SHFL_PER_TICKET;
    const myCombos = myStakedTickets + myStd + myPP * 18;

    const allCombos = othersCombos + myCombos;

    // ── Standard EV (per 1 ticket = 1 combo) ──
    const stdBreakdown = [];
    let totalStdEV = 0;

    for (let i = 0; i < 9; i++) {
      const pWin = DIV_COMBOS[i] / N;
      const lambda = allCombos * DIV_COMBOS[i] / N;
      const eShare = adjPools[i] / (1 + lambda);
      const ev = pWin * eShare;

      stdBreakdown.push({
        name: DIV_NAMES[i],
        short: DIV_SHORT[i],
        combos: DIV_COMBOS[i],
        pool: adjPools[i],
        pWin: pWin,
        lambda: lambda,
        eShare: eShare,
        ev: ev
      });

      totalStdEV += ev;
    }

    const stdROI = ((totalStdEV - STD_COST) / STD_COST) * 100;

    // ── Powerplay EV (per 1 PP ticket = 18 combos) ──
    const ppBreakdown = [];
    let totalPPEV = 0;

    for (let k = 0; k <= 5; k++) {
      const [pbIdx, noPbIdx] = K_TO_DIV[k];
      const probK = P_K[k];

      // PB share: 1 combo in that division
      const lambdaPB = allCombos * DIV_COMBOS[pbIdx] / N;
      const pbShare = adjPools[pbIdx] / (1 + lambdaPB);

      // noPB share: 17 combos if division exists
      let noPbShare = 0;
      if (noPbIdx >= 0) {
        const lambdaNoPB = allCombos * DIV_COMBOS[noPbIdx] / N;
        noPbShare = 17 * adjPools[noPbIdx] / (17 + lambdaNoPB);
      }

      const evK = probK * (pbShare + noPbShare);
      totalPPEV += evK;

      ppBreakdown.push({
        k: k,
        probK: probK,
        pbDiv: DIV_NAMES[pbIdx],
        pbShare: pbShare,
        noPbDiv: noPbIdx >= 0 ? DIV_NAMES[noPbIdx] : "—",
        noPbShare: noPbShare,
        ev: evK
      });
    }

    const ppROI = ((totalPPEV - PP_COST) / PP_COST) * 100;

    // ── Staked Yield ──
    const stakedCapital = SHFL_PER_TICKET * shflPrice;
    const weeklyYield = stakedCapital > 0 ? totalStdEV : 0;
    const annualYield = stakedCapital > 0 ? (weeklyYield * 52 / stakedCapital) * 100 : 0;

    // ── Breakeven ──
    const evPerDollarPool = totalPool > 0 ? totalStdEV / totalPool : 0;
    const breakevenPool = evPerDollarPool > 0 ? STD_COST / evPerDollarPool : Infinity;

    // ── My Position ──
    const myTotalEVStd = myStd * totalStdEV;
    const myTotalEVPP = myPP * totalPPEV;
    const myTotalEVStaked = myStakedTickets * totalStdEV;
    const myTotalEV = myTotalEVStd + myTotalEVPP + myTotalEVStaked;
    const myTotalCost = myStd * STD_COST + myPP * PP_COST + myShfl * shflPrice;
    const myNetPosition = myTotalEV - (myStd * STD_COST + myPP * PP_COST);
    const hasTickets = myStd > 0 || myPP > 0 || myShfl > 0;

    return {
      totalPool,
      adjTotalPool,
      allCombos,
      othersCombos,
      stdBreakdown,
      totalStdEV,
      stdROI,
      ppBreakdown: ppBreakdown.reverse(), // k=5 first
      totalPPEV,
      ppROI,
      stakedCapital,
      weeklyYield,
      annualYield,
      breakevenPool,
      myTotalEV,
      myTotalCost,
      myNetPosition,
      hasTickets,
      myTotalEVStd,
      myTotalEVPP,
      myTotalEVStaked,
      myStakedTickets: myStakedTickets,
      pools: adjPools
    };
  }

  // ── Formatting ────────────────────────────────────────────────────
  function fmtUSD(val) {
    if (!isFinite(val)) return "∞";
    if (Math.abs(val) >= 1000) {
      return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return "$" + val.toFixed(val < 1 && val > -1 ? 6 : 2);
  }

  function fmtUSDShort(val) {
    if (!isFinite(val)) return "∞";
    if (Math.abs(val) >= 1e6) return "$" + (val / 1e6).toFixed(2) + "M";
    if (Math.abs(val) >= 1e3) return "$" + (val / 1e3).toFixed(1) + "K";
    return "$" + val.toFixed(2);
  }

  function fmtPct(val) {
    if (!isFinite(val)) return "∞";
    return val.toFixed(2) + "%";
  }

  function fmtNum(val) {
    if (!isFinite(val)) return "∞";
    return val.toLocaleString("en-US");
  }

  function fmtSci(val) {
    if (val === 0) return "0";
    if (val < 0.0001) return val.toExponential(3);
    return val.toFixed(6);
  }

  // ── DOM Helpers ───────────────────────────────────────────────────
  function $(selector) {
    return document.querySelector(selector);
  }

  function getInputVal(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const val = parseFloat(el.value.replace(/,/g, ""));
    return isNaN(val) ? 0 : val;
  }

  // ── Read State from DOM ───────────────────────────────────────────
  function readState() {
    state.pools = [];
    for (let i = 0; i < 9; i++) {
      state.pools.push(getInputVal("pool-" + i));
    }

    state.participation.shflPrice = getInputVal("shfl-price");
    state.participation.shflStaked = getInputVal("shfl-staked");
    state.participation.othersStd = getInputVal("others-std");
    state.participation.othersPP = getInputVal("others-pp");

    state.my.myStd = getInputVal("my-std");
    state.my.myPP = getInputVal("my-pp");
    state.my.myShfl = getInputVal("my-shfl");
  }

  // ── Charts ────────────────────────────────────────────────────────
  let poolChart = null;
  let evChart = null;

  function initCharts() {
    // Chart.js global defaults for dark theme
    if (typeof Chart !== "undefined") {
      Chart.defaults.color = "#9B8DB8";
      Chart.defaults.borderColor = "rgba(45, 27, 82, 0.5)";
      Chart.defaults.font.family = "'Satoshi', sans-serif";
    }
  }

  function updateCharts(result) {
    const chartColors = [
      "#7717FF", "#A379F7", "#844CF6", "#D4A843",
      "#4ADE80", "#F87171", "#60A5FA", "#C084FC", "#FBBF24"
    ];

    // Pool distribution doughnut
    const poolCtx = document.getElementById("chart-pool");
    if (!poolCtx) return;

    if (poolChart) {
      poolChart.data.datasets[0].data = result.pools;
      poolChart.update("none");
    } else {
      poolChart = new Chart(poolCtx, {
        type: "doughnut",
        data: {
          labels: DIV_SHORT,
          datasets: [{
            data: result.pools,
            backgroundColor: chartColors,
            borderColor: "#0D0620",
            borderWidth: 2,
            hoverBorderColor: "#EEE2FF",
            hoverBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: "60%",
          plugins: {
            legend: {
              position: "right",
              labels: {
                padding: 12,
                usePointStyle: true,
                pointStyleWidth: 10,
                font: { size: 11 }
              }
            },
            tooltip: {
              backgroundColor: "#1A0E35",
              borderColor: "#2D1B52",
              borderWidth: 1,
              titleFont: { weight: "600" },
              callbacks: {
                label: function (ctx) {
                  return " " + ctx.label + ": " + fmtUSD(ctx.raw);
                }
              }
            }
          }
        }
      });
    }

    // EV by division bar chart
    const evCtx = document.getElementById("chart-ev");
    if (!evCtx) return;

    const evData = result.stdBreakdown.map(d => d.ev);
    const barColors = evData.map(v => v > 0.001 ? "#7717FF" : "#3B1B6B");

    if (evChart) {
      evChart.data.datasets[0].data = evData;
      evChart.data.datasets[0].backgroundColor = barColors;
      evChart.update("none");
    } else {
      evChart = new Chart(evCtx, {
        type: "bar",
        data: {
          labels: DIV_SHORT,
          datasets: [{
            label: "EV per Ticket ($)",
            data: evData,
            backgroundColor: barColors,
            borderRadius: 4,
            borderSkipped: false,
            hoverBackgroundColor: "#A379F7"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#1A0E35",
              borderColor: "#2D1B52",
              borderWidth: 1,
              callbacks: {
                label: function (ctx) {
                  return " EV: $" + ctx.raw.toFixed(6);
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 } }
            },
            y: {
              grid: { color: "rgba(45, 27, 82, 0.3)" },
              ticks: {
                font: { size: 11 },
                callback: function (val) {
                  if (val >= 0.01) return "$" + val.toFixed(3);
                  return "$" + val.toFixed(4);
                },
                maxTicksLimit: 6
              }
            }
          }
        }
      });
    }
  }

  // ── Render Results ────────────────────────────────────────────────
  function render(result) {
    // KPIs
    $("#kpi-total-pool").textContent = fmtUSDShort(result.totalPool);
    $("#kpi-total-pool-sub").textContent = "9 divisions";

    $("#kpi-yield").textContent = fmtPct(result.annualYield);
    $("#kpi-yield-sub").textContent = "Weekly: " + fmtUSD(result.weeklyYield) + " / " + fmtUSD(result.stakedCapital) + " capital";
    const yieldBadge = $("#kpi-yield-badge");
    yieldBadge.textContent = result.annualYield > 0 ? "+EV" : "0%";
    yieldBadge.className = "kpi-card__badge " +
      (result.annualYield > 0 ? "kpi-card__badge--positive" : "kpi-card__badge--negative");

    $("#kpi-combos").textContent = fmtNum(Math.round(result.allCombos));
    $("#kpi-combos-sub").textContent = "Others: " + fmtNum(Math.round(result.othersCombos));

    // My Position
    const posSection = $("#my-position");
    const posEmpty = $("#position-empty");
    const posGrid = $("#position-grid");

    if (result.hasTickets) {
      posEmpty.classList.add("hidden");
      posGrid.classList.remove("hidden");

      $("#pos-total-ev").textContent = fmtUSD(result.myTotalEV);
      $("#pos-total-ev").style.color = result.myTotalEV >= 0 ? "var(--green)" : "var(--red)";

      const myCostTickets = state.my.myStd * STD_COST + state.my.myPP * PP_COST;
      $("#pos-total-cost").textContent = fmtUSD(myCostTickets);

      $("#pos-net").textContent = fmtUSD(result.myNetPosition);
      $("#pos-net").style.color = result.myNetPosition >= 0 ? "var(--green)" : "var(--red)";

      const myShflVal = state.my.myShfl * state.participation.shflPrice;
      $("#pos-staked-val").textContent = fmtUSD(myShflVal);
    } else {
      posEmpty.classList.remove("hidden");
      posGrid.classList.add("hidden");
    }

    // Charts
    updateCharts(result);
  }

  // ── Staking Dashboard Charts ──────────────────────────────────────
  var poolHistoryChart = null;
  var ngrHistoryChart = null;
  var singlesHistoryChart = null;
  var cumulativeChart = null;

  function initStakingDashboard() {
    if (typeof HISTORY_DATA === "undefined" || typeof Chart === "undefined") return;

    var data = HISTORY_DATA;
    var labels = data.map(function (d) { return "#" + d.draw; });
    var pools = data.map(function (d) { return d.pool; });
    var ngrs = data.map(function (d) { return d.ngrAdded; });
    var singles = data.map(function (d) { return d.singlesAdded; });

    // Cumulative calculations
    var cumNGR = [];
    var cumSingles = [];
    var runningNGR = 0;
    var runningSingles = 0;
    for (var i = 0; i < data.length; i++) {
      runningNGR += ngrs[i];
      runningSingles += singles[i];
      cumNGR.push(runningNGR);
      cumSingles.push(runningSingles);
    }

    // Stats
    var totalNGR = cumNGR[cumNGR.length - 1];
    var totalSingles = cumSingles[cumSingles.length - 1];
    var sortedNGR = ngrs.slice().sort(function (a, b) { return a - b; });
    var medianNGR = sortedNGR[Math.floor(sortedNGR.length / 2)];
    var avgNGR = totalNGR / data.length;
    var avgSingles = totalSingles / data.length;

    // Jackpot hits: confirmed on draws 41, 61, 72
    var jackpotCount = 3;

    // Populate KPI values
    var skCumNGR = $("#sk-cum-ngr");
    var skCumSingles = $("#sk-cum-singles");
    var skMedianNGR = $("#sk-median-ngr");
    var skJackpots = $("#sk-jackpots");
    var skAvgNGR = $("#sk-avg-ngr");
    var skAvgSingles = $("#sk-avg-singles");

    // Total paid to players and stakers (absolute figure from Shuffle)
    var skTotalPaid = $("#sk-total-paid");
    if (skTotalPaid) skTotalPaid.textContent = "$>20M";

    if (skCumNGR) skCumNGR.textContent = fmtUSDShort(totalNGR);
    if (skCumSingles) skCumSingles.textContent = fmtUSDShort(totalSingles);
    if (skMedianNGR) skMedianNGR.textContent = fmtUSDShort(medianNGR);
    if (skJackpots) skJackpots.textContent = jackpotCount;
    if (skAvgNGR) skAvgNGR.textContent = "Avg: " + fmtUSDShort(avgNGR) + "/wk";
    if (skAvgSingles) skAvgSingles.textContent = "Avg: " + fmtUSDShort(avgSingles) + "/wk";

    // Shared tooltip config
    var tooltipCfg = {
      backgroundColor: "#1A0E35",
      borderColor: "#2D1B52",
      borderWidth: 1,
      titleFont: { weight: "600" },
      bodyFont: { size: 12 },
      padding: 10,
      cornerRadius: 6
    };

    var gridColor = "rgba(45, 27, 82, 0.3)";

    // ── Prize Pool Over Time (line+area) ──
    var poolHistCtx = document.getElementById("chart-pool-history");
    if (poolHistCtx) {
      poolHistoryChart = new Chart(poolHistCtx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "Prize Pool",
            data: pools,
            borderColor: "#7717FF",
            backgroundColor: createGradient(poolHistCtx, "#7717FF", 0.25, 0.0),
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: "#A379F7",
            pointHoverBorderColor: "#EEE2FF",
            pointHoverBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltipCfg, {
              callbacks: {
                title: function (items) {
                  var idx = items[0].dataIndex;
                  return "Draw #" + data[idx].draw + " — " + data[idx].date;
                },
                label: function (ctx) {
                  return " Prize Pool: " + fmtUSD(ctx.raw);
                }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 10 },
                maxTicksLimit: 12,
                maxRotation: 0
              }
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                font: { size: 11 },
                callback: function (val) { return fmtUSDShort(val); },
                maxTicksLimit: 6
              }
            }
          }
        }
      });
    }

    // ── Weekly NGR (bar) ──
    var ngrCtx = document.getElementById("chart-ngr-history");
    if (ngrCtx) {
      ngrHistoryChart = new Chart(ngrCtx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [{
            label: "NGR Added",
            data: ngrs,
            backgroundColor: ngrs.map(function (v) {
              return v > medianNGR ? "#7717FF" : "#3B1B6B";
            }),
            borderRadius: 2,
            borderSkipped: false,
            hoverBackgroundColor: "#A379F7"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltipCfg, {
              callbacks: {
                title: function (items) {
                  var idx = items[0].dataIndex;
                  return "Draw #" + data[idx].draw + " — " + data[idx].date;
                },
                label: function (ctx) {
                  return " NGR: " + fmtUSD(ctx.raw);
                }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                font: { size: 11 },
                callback: function (val) { return fmtUSDShort(val); },
                maxTicksLimit: 5
              }
            }
          }
        }
      });
    }

    // ── Weekly Singles (bar) ──
    var singlesCtx = document.getElementById("chart-singles-history");
    if (singlesCtx) {
      singlesHistoryChart = new Chart(singlesCtx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [{
            label: "Singles Revenue",
            data: singles,
            backgroundColor: singles.map(function (v) {
              return v > 10000 ? "#D4A843" : "rgba(212, 168, 67, 0.35)";
            }),
            borderRadius: 2,
            borderSkipped: false,
            hoverBackgroundColor: "#E8C774"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltipCfg, {
              callbacks: {
                title: function (items) {
                  var idx = items[0].dataIndex;
                  return "Draw #" + data[idx].draw + " — " + data[idx].date;
                },
                label: function (ctx) {
                  return " Singles: " + fmtUSD(ctx.raw);
                }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                font: { size: 11 },
                callback: function (val) { return fmtUSDShort(val); },
                maxTicksLimit: 5
              }
            }
          }
        }
      });
    }

    // ── Cumulative Inflows (stacked area) ──
    var cumCtx = document.getElementById("chart-cumulative");
    if (cumCtx) {
      cumulativeChart = new Chart(cumCtx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Cumulative NGR",
              data: cumNGR,
              borderColor: "#4ADE80",
              backgroundColor: createGradient(cumCtx, "#4ADE80", 0.2, 0.0),
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: "#4ADE80",
              pointHoverBorderColor: "#EEE2FF",
              pointHoverBorderWidth: 2
            },
            {
              label: "Cumulative Singles",
              data: cumSingles,
              borderColor: "#D4A843",
              backgroundColor: createGradient(cumCtx, "#D4A843", 0.15, 0.0),
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: "#D4A843",
              pointHoverBorderColor: "#EEE2FF",
              pointHoverBorderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: {
              position: "top",
              align: "end",
              labels: {
                padding: 16,
                usePointStyle: true,
                pointStyleWidth: 10,
                font: { size: 11 }
              }
            },
            tooltip: Object.assign({}, tooltipCfg, {
              callbacks: {
                title: function (items) {
                  var idx = items[0].dataIndex;
                  return "Draw #" + data[idx].draw + " — " + data[idx].date;
                },
                label: function (ctx) {
                  return " " + ctx.dataset.label + ": " + fmtUSD(ctx.raw);
                }
              }
            })
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, maxTicksLimit: 12, maxRotation: 0 }
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                font: { size: 11 },
                callback: function (val) { return fmtUSDShort(val); },
                maxTicksLimit: 6
              }
            }
          }
        }
      });
    }
  }

  function createGradient(canvas, color, alphaTop, alphaBottom) {
    var ctx = canvas.getContext("2d");
    var gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement ? canvas.parentElement.clientHeight || 300 : 300);
    gradient.addColorStop(0, hexToRGBA(color, alphaTop));
    gradient.addColorStop(1, hexToRGBA(color, alphaBottom));
    return gradient;
  }

  function hexToRGBA(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  // ── Initialization ────────────────────────────────────────────────
  function init() {
    initCharts();

    // Bind input events
    const allInputs = document.querySelectorAll("input[type='number'], input[type='text']");
    allInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        readState();
        var result = calculate(state);
        render(result);
      });
    });

    // Initial calc
    readState();
    var result = calculate(state);
    render(result);

    // Init staking dashboard
    initStakingDashboard();

    // Scroll reveal — stagger with delay for sections in view
    var reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      var revealIndex = 0;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = revealIndex++;
            setTimeout(function () {
              entry.target.classList.add("visible");
            }, idx * 80);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05, rootMargin: "0px 0px 50px 0px" });

      reveals.forEach(function (el) { observer.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("visible"); });
    }
  }

  // ── CoinGecko SHFL Price Fetch ──────────────────────────────────
  var COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=shuffle-2&x_cg_demo_api_key=CG-qUdrVCZN3uiuPauu4vvS6vNB";
  var PRICE_INTERVAL = 10 * 60 * 1000; // 10 minutes

  function fetchSHFLPrice() {
    var statusDot = document.getElementById("price-status");
    var priceInput = document.getElementById("shfl-price");
    if (!priceInput) return;

    fetch(COINGECKO_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var tokenData = data && data["shuffle-2"];
        if (tokenData && typeof tokenData.usd === "number") {
          priceInput.value = tokenData.usd;
          if (statusDot) {
            statusDot.className = "price-live-dot";
            statusDot.title = "Live price — updated " + new Date().toLocaleTimeString();
          }
          // Trigger recalc
          readState();
          var result = calculate(state);
          render(result);
        }
      })
      .catch(function () {
        if (statusDot) {
          statusDot.className = "price-live-dot price-live-dot--error";
          statusDot.title = "Price fetch failed — using manual value";
        }
      });
  }

  function startPriceFeed() {
    fetchSHFLPrice();
    setInterval(fetchSHFLPrice, PRICE_INTERVAL);
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
      startPriceFeed();
    });
  } else {
    init();
    startPriceFeed();
  }
})();
