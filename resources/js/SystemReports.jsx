import { useState } from "react";
import "./styles/SystemReports.css";

const stats = [
  { label: "Total Student Profiles", value: "11,953", sub: "+87 this month" },
  { label: "Credentials Archived", value: "42,717", sub: "Last: 24 min ago" },
  { label: "Completed Requests", value: "1,284", sub: "96.2% resolution rate" },
  { label: "Active Registrar Staff", value: "4", sub: "+1 this month" },
];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const trendData = [
  { uploads: 28, requests: 18 },
  { uploads: 38, requests: 24 },
  { uploads: 42, requests: 30 },
  { uploads: 55, requests: 38 },
  { uploads: 60, requests: 42 },
  { uploads: 72, requests: 50 },
  { uploads: 65, requests: 45 },
  { uploads: 90, requests: 62 },
  { uploads: 80, requests: 55 },
  { uploads: 88, requests: 60 },
  { uploads: 75, requests: 52 },
  { uploads: 68, requests: 44 },
];

const credentialStored = [
  { label: "Grades", value: 331, color: "#e6a817" },
  { label: "Birth Certificate", value: 312, color: "#e6a817" },
  { label: "Form 138", value: 298, color: "#3b82f6" },
  { label: "Good Moral", value: 287, color: "#a78bfa" },
  { label: "Form 137", value: 245, color: "#22c55e" },
  { label: "TOR", value: 178, color: "#ec4899" },
  { label: "LOA", value: 54, color: "#6366f1" },
  { label: "Withdrawal", value: 32, color: "#f87171" },
];

const requestedCredentials = [
  { label: "Transcript of Records", value: 284 },
  { label: "Diploma Replacement", value: 241 },
  { label: "Evaluation", value: 198 },
  { label: "CAV Certification", value: 176 },
  { label: "Honorable Dismissal", value: 154 },
  { label: "Certification", value: 132 },
  { label: "Form 137", value: 118 },
  { label: "Permit to Study", value: 97 },
  { label: "Correction of Name", value: 73 },
];

const maxStored = Math.max(...credentialStored.map(c => c.value));
const maxRequested = Math.max(...requestedCredentials.map(c => c.value));

// ── TREND BAR CHART ──
function TrendChart({ data, months, dateFrom, dateTo }) {
  const svgWidth = 680;
  const svgHeight = 200;
  const paddingLeft = 44;
  const paddingRight = 16;
  const paddingTop = 12;
  const paddingBottom = 36;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const maxVal = Math.max(...data.map(d => Math.max(d.uploads, d.requests))) * 1.2;
  const barGroupWidth = chartWidth / data.length;
  const barWidth = barGroupWidth * 0.28;
  const yTicks = [0, 30, 60, 90, 120];

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="sr-bar-chart-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {yTicks.map(tick => {
        const y = paddingTop + chartHeight - (tick / maxVal) * chartHeight;
        return (
          <g key={tick}>
            <line
              x1={paddingLeft} y1={y}
              x2={svgWidth - paddingRight} y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
            <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.22)">
              {tick}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const groupX = paddingLeft + i * barGroupWidth;
        const centerX = groupX + barGroupWidth / 2;
        const uploadH = (d.uploads / maxVal) * chartHeight;
        const requestH = (d.requests / maxVal) * chartHeight;

        return (
          <g key={i}>
            <rect
              x={centerX - barWidth - 2}
              y={paddingTop + chartHeight - uploadH}
              width={barWidth} height={uploadH}
              fill="#e6a817" opacity="0.88" rx="2"
            />
            <rect
              x={centerX + 2}
              y={paddingTop + chartHeight - requestH}
              width={barWidth} height={requestH}
              fill="#3b82f6" opacity="0.7" rx="2"
            />
            <text
              x={centerX} y={svgHeight - 8}
              textAnchor="middle" fontSize="10"
              fill="rgba(255,255,255,0.28)"
            >
              {months[i]}
            </text>
          </g>
        );
      })}

      <line
        x1={paddingLeft} y1={paddingTop + chartHeight}
        x2={svgWidth - paddingRight} y2={paddingTop + chartHeight}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1"
      />
    </svg>
  );
}

// ── MOST REQUESTED CREDENTIALS CHART ──
function RequestedChart({ data, maxVal }) {
  const svgWidth = 420;
  const svgHeight = 240;
  const paddingLeft = 12;
  const paddingRight = 44;
  const paddingTop = 12;
  const paddingBottom = 36;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const barGroupHeight = chartHeight / data.length;
  const barH = barGroupHeight * 0.48;
  const xTicks = [0, 75, 150, 225, 300];

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="sr-req-chart-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {xTicks.map(tick => {
        const x = paddingLeft + (tick / maxVal) * chartWidth;
        return (
          <g key={tick}>
            <line
              x1={x} y1={paddingTop}
              x2={x} y2={paddingTop + chartHeight}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"
            />
            <text
              x={x} y={svgHeight - 6}
              textAnchor="middle" fontSize="9"
              fill="rgba(255,255,255,0.22)"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const centerY = paddingTop + i * barGroupHeight + barGroupHeight / 2;
        const barWidth = (d.value / maxVal) * chartWidth;

        return (
          <g key={i}>
            <rect
              x={paddingLeft}
              y={centerY - barH / 2}
              width={barWidth} height={barH}
              fill="#22c55e" opacity="0.8" rx="3"
            />
            <text
              x={paddingLeft + barWidth + 6}
              y={centerY + 4}
              fontSize="10" fill="rgba(255,255,255,0.7)"
              fontWeight="bold"
            >
              {d.value}
            </text>
          </g>
        );
      })}

      <line
        x1={paddingLeft} y1={paddingTop}
        x2={paddingLeft} y2={paddingTop + chartHeight}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1"
      />
    </svg>
  );
}

export default function SystemReports() {
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState("2026-05-25");

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h2 className="sr-page-title">System Reports</h2>
        <p className="sr-page-sub">Analytics and document activity overview</p>
      </div>

      {/* Stat Cards */}
      <div className="sr-stats-grid">
        {stats.map((s, i) => (
          <div key={i} className="sr-stat-card">
            <p className="sr-stat-label">{s.label}</p>
            <p className="sr-stat-value">{s.value}</p>
            <p className="sr-stat-sub">{s.sub}</p>
            <div className="sr-stat-accent" />
          </div>
        ))}
      </div>

      {/* Monthly Upload Trends */}
      <div className="sr-card">
        <div className="sr-card-header">
          <h3 className="sr-card-title">Monthly Upload Trends</h3>
          <div className="sr-date-row">
            <input
              type="date"
              className="sr-date-input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span className="sr-date-label">to</span>
            <input
              type="date"
              className="sr-date-input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        </div>
        <TrendChart data={trendData} months={months} dateFrom={dateFrom} dateTo={dateTo} />
        <div className="sr-bar-legend">
          <span className="sr-bar-legend-item">
            <span className="sr-legend-dot-gold" /> Uploads
          </span>
          <span className="sr-bar-legend-item">
            <span className="sr-legend-dot-blue" /> Document Requests
          </span>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="sr-bottom-row">

        {/* Most Stored Credentials */}
        <div className="sr-card" style={{ marginBottom: 0 }}>
          <div className="sr-card-header">
            <h3 className="sr-card-title">Most Stored Credentials</h3>
          </div>
          {credentialStored.map((c, i) => (
            <div key={i} className="sr-hbar-row">
              <span className="sr-hbar-label">{c.label}</span>
              <div className="sr-hbar-track">
                <div
                  className="sr-hbar-fill"
                  style={{
                    width: `${(c.value / maxStored) * 100}%`,
                    backgroundColor: c.color,
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="sr-hbar-value">{c.value}</span>
            </div>
          ))}
        </div>

        {/* Most Requested Credentials */}
        <div className="sr-card" style={{ marginBottom: 0 }}>
          <div className="sr-card-header">
            <h3 className="sr-card-title">Most Requested Credentials</h3>
          </div>
          <div className="flex gap-6">
            <div className="flex flex-col justify-around py-1" style={{ minWidth: "148px" }}>
              {requestedCredentials.map((c, i) => (
                <span key={i} className="sr-hbar-label" style={{ paddingBottom: "6px" }}>
                  {c.label}
                </span>
              ))}
            </div>
            <div className="flex-1">
              <RequestedChart data={requestedCredentials} maxVal={maxRequested * 1.15} />
            </div>
          </div>
        </div>

      </div>
    </>
  );
}