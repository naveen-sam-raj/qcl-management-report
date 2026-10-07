import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { MOCK_PLANTS } from '../../services/mockData';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ArrowLeft,
  Factory,
  Flame,
  Globe,
  Gauge,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Zap,
  TrendingUp,
  Cpu,
  Download,
  Settings,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';

const PlantDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [plant, setPlant] = useState(null);
  const [telemetry, setTelemetry] = useState([]);
  const [chartMetric, setChartMetric] = useState('efficiency');

  useEffect(() => {
    const fetchPlant = async () => {
      try {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 400));
        // Find plant by id in mock data
        const found = MOCK_PLANTS.find((p) => p._id === id || p.code === id);
        if (found) {
          setPlant(found);
          // Generate mock telemetry for chart
          const mockTelemetry = Array.from({ length: 14 }, (_, i) => ({
            date: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            efficiency: Math.max(60, (found.efficiency || 90) + Math.floor(Math.random() * 10) - 5),
            production: Math.max(50, (found.currentProduction || 100) + Math.floor(Math.random() * 20) - 10),
          }));
          setTelemetry(mockTelemetry);
        } else {
          showToast('Plant not found', 'error');
          navigate('/admin/tfl');
        }
      } catch (err) {
        showToast('Error loading plant data', 'error');
        navigate('/admin/tfl');
      } finally {
        setLoading(false);
      }
    };
    fetchPlant();
  }, [id, navigate]);

  if (loading || !plant) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const getPlantIcon = (code) => {
    switch (code) {
      case 'ACL':
        return <Factory className="w-8 h-8 text-blue-600" />;
      case 'SA':
        return <Flame className="w-8 h-8 text-amber-600" />;
      case 'OFFSITE':
        return <Globe className="w-8 h-8 text-emerald-600" />;
      case 'CO2':
        return <Gauge className="w-8 h-8 text-indigo-600" />;
      default:
        return <Factory className="w-8 h-8 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link
          to={user?.role === 'user' ? '/portal' : '/admin/tfl'}
          className="hover:text-blue-600 flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{user?.role === 'user' ? 'My Portal' : 'TFL Analytics'}</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-bold">{plant.name}</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
            {getPlantIcon(plant.code)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900">{plant.name}</h1>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {plant.code}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                {plant.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              {plant.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate('/admin/tfl/reports')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>Unit Reports</span>
          </button>
        </div>
      </div>

      {/* Telemetry Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">Design Capacity</div>
          <div className="text-base font-extrabold text-slate-900 mt-1">{plant.capacity}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">Daily Output</div>
          <div className="text-base font-extrabold text-slate-900 mt-1">
            {plant.dailyProduction?.toLocaleString()} <span className="text-xs text-slate-500 font-normal">TPD</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">Yield Efficiency</div>
          <div className="text-base font-extrabold text-emerald-600 mt-1">{plant.efficiency}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">Reactor Temp</div>
          <div className="text-base font-extrabold text-blue-600 mt-1">{plant.parameters?.temperature}°C</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">Core Pressure</div>
          <div className="text-base font-extrabold text-slate-900 mt-1">{plant.parameters?.pressure} Bar</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-medium text-slate-400">CO2 Capture</div>
          <div className="text-base font-extrabold text-indigo-600 mt-1">{plant.parameters?.co2CaptureRate}%</div>
        </div>
      </div>

      {/* Main Real-Time Telemetry Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">24-Hour Continuous Telemetry Trend</h3>
            <p className="text-xs text-slate-500">Real-time sensor feed from SCADA & DCS control room integration</p>
          </div>

          {/* Metric Selector Toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            {[
              { id: 'efficiency', label: 'Efficiency (%)' },
              { id: 'temperature', label: 'Temperature (°C)' },
              { id: 'flowRate', label: 'Flow Rate (m³/h)' },
              { id: 'pressure', label: 'Pressure (Bar)' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setChartMetric(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  chartMetric === m.id
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Chart Container */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetry} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#CBD5E1" />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#CBD5E1" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                }}
              />
              <Area
                type="monotone"
                dataKey={chartMetric}
                stroke="#2563EB"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorMetric)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Operational Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Unit Engineering Specifications</h4>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Chief Plant Engineer:</span>
              <span className="font-bold text-slate-800">{plant.operatorInCharge}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Power Consumption Rating:</span>
              <span className="font-bold text-slate-800">{plant.powerConsumption}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Continuous Uptime Hours:</span>
              <span className="font-bold text-slate-800">{plant.parameters?.uptimeHours} hrs (30 Days)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Chemical Purity Standard:</span>
              <span className="font-bold text-emerald-600">{plant.parameters?.purityLevel}% (High Grade)</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Active Safety Incidents:</span>
              <span className="font-bold text-slate-800">{plant.safetyIncidents} (Zero Incident Record)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">SCADA Integration Status</h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              DCS loop telemetry is configured for automated polling. Modbus TCP & OPC-UA gateways are delivering uninterrupted operational metrics.
            </p>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Sensors calibrated and compliant with ISO 9001:2015 standards.</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Subsystem: {plant.code}_DCS_FEED_01</span>
            <span className="text-xs font-bold text-blue-600">Telemetry Online</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlantDetailsPage;
