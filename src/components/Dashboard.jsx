import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import logo from '../assets/logo.png';
import { formatCurrency } from '../utils/formatters';

const Dashboard = ({ 
  userName, 
  dashboardData, 
  dashboardLoading, 
  onNavigate,
  isSuperAdmin,
  onMassDelete,
  onLogout
}) => {
  if (dashboardLoading) {
    return (
      <div className="hf-flex-center" style={{minHeight: '60vh'}}>
        <div className="hf-card hf-text-center">
          <div className="hf-loading" style={{width: '40px', height: '40px', margin: '0 auto 1rem'}}></div>
          <p>Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="hf-card">
        <p>No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="hf-page">
      <div className="hf-header">
        <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
          <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
          <h2>Dashboard</h2>
        </div>
        <div className="hf-flex hf-gap-sm">
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('portfolio')}>
            <span>💼 Portfolio</span>
          </button>
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('inversiones')}>
            <span>📈 Inversiones</span>
          </button>
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('gastos')}>
            <span>💰 Gastos</span>
          </button>
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('reportes')}>
            <span>📊 Reportes</span>
          </button>
          <button className="hf-button hf-button-ghost" onClick={onLogout} style={{marginLeft: 'var(--hf-space-md)'}}>
            <span>🚪 Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Welcome Section */}
      <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
        <h1 className="text-2xl font-bold mb-2">Bienvenido, {userName}</h1>
        <p style={{color: 'var(--hf-text-secondary)'}}>
          Aquí tienes un resumen de tu situación financiera actual
        </p>
      </div>

      {/* Investment Metrics */}
      <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
        <h3 className="text-lg font-semibold mb-4 hf-text-gradient">💼 Inversiones</h3>
        <div className="hf-metrics-grid">
          <div className="hf-metric-card">
            <div className="hf-metric-label">Total Invertido</div>
            <div className="hf-metric-value">{formatCurrency(dashboardData.totalInvertido, 'USD')}</div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">P&L Realizado</div>
            <div className="hf-metric-value" style={{color: dashboardData.plRealizado >= 0 ? 'var(--hf-success)' : 'var(--hf-danger)'}}>
              {formatCurrency(dashboardData.plRealizado, 'USD')}
            </div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">Posiciones Abiertas</div>
            <div className="hf-metric-value">{dashboardData.posicionesAbiertas}</div>
          </div>
        </div>
      </div>

      {/* Cashflow Metrics */}
      <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
        <h3 className="text-lg font-semibold mb-4 hf-text-gradient">💰 Cashflow del Mes</h3>
        <div className="hf-metrics-grid">
          <div className="hf-metric-card">
            <div className="hf-metric-label">Total Ingresos</div>
            <div className="hf-metric-value" style={{color: 'var(--hf-success)'}}>{formatCurrency(dashboardData.totalIngresos, 'ARS')}</div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">Total Gastos</div>
            <div className="hf-metric-value" style={{color: 'var(--hf-danger)'}}>{formatCurrency(dashboardData.totalGastos, 'ARS')}</div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">Balance</div>
            <div className="hf-metric-value" style={{color: dashboardData.balance >= 0 ? 'var(--hf-success)' : 'var(--hf-danger)'}}>
              {formatCurrency(dashboardData.balance, 'ARS')}
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      {dashboardData.monthlyTrend && dashboardData.monthlyTrend.length > 0 && (
        <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
          <h3 className="text-lg font-semibold mb-4 hf-text-gradient">📊 Tendencia Mensual (Últimos 12 Meses)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value, 'ARS')} />
              <Legend />
              <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" />
              <Bar dataKey="gastos" fill="#ef4444" name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Assets and Categories Grid */}
      <div className="hf-grid-2col" style={{marginBottom: 'var(--hf-space-lg)'}}>
        {/* Top Assets */}
        <div className="hf-card">
          <h3 className="text-lg font-semibold mb-4 hf-text-gradient">🏆 Top 5 Activos</h3>
          {dashboardData.topAssets && dashboardData.topAssets.length > 0 ? (
            <div className="hf-list">
              {dashboardData.topAssets.map((asset, idx) => (
                <div key={idx} className="hf-list-item">
                  <div className="hf-flex" style={{justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                    <div>
                      <div style={{fontWeight: '500'}}>{asset.activo}</div>
                      <div style={{fontSize: '0.875rem', color: 'var(--hf-text-secondary)'}}>{asset.tipo}</div>
                    </div>
                    <div style={{textAlign: 'right', fontWeight: '600', color: asset.isOpen ? 'var(--hf-primary)' : (asset.pl >= 0 ? 'var(--hf-success)' : 'var(--hf-danger)')}}>
                      {formatCurrency(asset.pl, asset.moneda)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{color: 'var(--hf-text-secondary)', textAlign: 'center', padding: '2rem'}}>
              No hay datos de activos
            </p>
          )}
        </div>

        {/* Top Categories */}
        <div className="hf-card">
          <h3 className="text-lg font-semibold mb-4 hf-text-gradient">📂 Top 5 Categorías de Gastos</h3>
          {dashboardData.topCategories && dashboardData.topCategories.length > 0 ? (
            <div className="hf-list">
              {dashboardData.topCategories.map((cat, idx) => (
                <div key={idx} className="hf-list-item">
                  <div className="hf-flex" style={{justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                    <div style={{fontWeight: '500'}}>{cat.categoria}</div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontWeight: '600', color: 'var(--hf-danger)'}}>{formatCurrency(cat.monto, 'ARS')}</div>
                      <div style={{fontSize: '0.875rem', color: 'var(--hf-text-secondary)'}}>{cat.count} registro{cat.count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{color: 'var(--hf-text-secondary)', textAlign: 'center', padding: '2rem'}}>
              No hay gastos registrados este mes
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="hf-card">
        <h3 className="text-lg font-semibold mb-4 hf-text-gradient">⚡ Acciones Rápidas</h3>
        <div className="hf-flex hf-gap-md" style={{flexWrap: 'wrap'}}>
          <button className="hf-button hf-button-primary" onClick={() => onNavigate('inversiones')}>
            ➕ Nueva Inversión
          </button>
          <button className="hf-button hf-button-primary" onClick={() => onNavigate('gastos')}>
            ➕ Registrar Gasto/Ingreso
          </button>
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('portfolio')}>
            📊 Ver Portfolio Completo
          </button>
          <button className="hf-button hf-button-secondary" onClick={() => onNavigate('reportes')}>
            📈 Generar Reporte
          </button>
        </div>
      </div>

      {/* Super Admin - Danger Zone */}
      {isSuperAdmin && onMassDelete && (
        <div className="hf-card" style={{marginTop: 'var(--hf-space-lg)', borderColor: 'var(--hf-danger)'}}>
          <h3 className="text-lg font-semibold mb-4" style={{color: 'var(--hf-danger)'}}>⚠️ Zona de Peligro (Super Admin)</h3>
          <p style={{marginBottom: 'var(--hf-space-md)', color: 'var(--hf-text-secondary)'}}>
            Estas acciones son irreversibles y eliminarán datos de forma permanente.
          </p>
          <div className="hf-flex hf-gap-md" style={{flexWrap: 'wrap'}}>
            <button 
              className="hf-button hf-button-danger" 
              onClick={() => onMassDelete('all-transactions')}
            >
              🗑️ Eliminar Todas las Inversiones
            </button>
            <button 
              className="hf-button hf-button-danger" 
              onClick={() => onMassDelete('all-cashflow')}
            >
              🗑️ Eliminar Todos los Gastos/Ingresos
            </button>
            <button 
              className="hf-button hf-button-danger" 
              onClick={() => onMassDelete('everything')}
            >
              💥 Eliminar TODO
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
