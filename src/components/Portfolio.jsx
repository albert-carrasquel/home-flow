import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import logo from '../assets/logo.png';
import { formatCurrency } from '../utils/formatters';
import { USER_NAMES } from '../config/constants';

const Portfolio = ({ 
  portfolioData, 
  portfolioLoading, 
  onNavigate 
}) => {
  if (portfolioLoading) {
    return (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Portfolio de Posiciones Abiertas</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => onNavigate('dashboard')}>🏠 Dashboard</button>
        </div>
        <div className="hf-flex-center" style={{minHeight: '60vh'}}>
          <div className="hf-card hf-text-center">
            <div className="hf-loading" style={{width: '40px', height: '40px', margin: '0 auto 1rem'}}></div>
            <p>Cargando portfolio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Portfolio de Posiciones Abiertas</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => onNavigate('dashboard')}>🏠 Dashboard</button>
        </div>
        <div className="hf-card hf-alert-error">
          <p>Error al cargar datos del portfolio</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hf-page">
      <div className="hf-header">
        <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
          <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
          <h2>Portfolio de Posiciones Abiertas</h2>
        </div>
        <button className="hf-button hf-button-ghost" onClick={() => onNavigate('dashboard')}>🏠 Dashboard</button>
      </div>

      {/* Summary Cards */}
      <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
        <h3 className="text-lg font-semibold mb-4 hf-text-gradient">📊 Resumen del Portfolio</h3>
        <div className="hf-metrics-grid">
          <div className="hf-metric-card">
            <div className="hf-metric-label">Total Invertido</div>
            <div className="hf-metric-value" style={{color: 'var(--hf-text-secondary)'}}>
              {formatCurrency(portfolioData.resumen.totalInvertido, 'ARS')}
            </div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">Total Posiciones</div>
            <div className="hf-metric-value">{portfolioData.resumen.totalPosiciones}</div>
          </div>
          <div className="hf-metric-card">
            <div className="hf-metric-label">Activos Únicos</div>
            <div className="hf-metric-value">{portfolioData.resumen.totalActivos}</div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Diversification */}
      <div className="hf-grid-2" style={{gap: 'var(--hf-space-lg)', alignItems: 'start', marginBottom: 'var(--hf-space-lg)'}}>
        {/* By Asset Type */}
        <div className="hf-card">
          <h3 className="text-lg font-semibold mb-4">🏷️ Diversificación por Tipo</h3>
          {portfolioData.porTipo.length === 0 ? (
            <div className="hf-empty-state">
              <p>No hay datos de diversificación</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={portfolioData.porTipo}
                    dataKey="porcentaje"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({tipo, porcentaje}) => `${tipo}: ${porcentaje.toFixed(1)}%`}
                  >
                    {portfolioData.porTipo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="hf-list" style={{marginTop: 'var(--hf-space-md)'}}>
                {portfolioData.porTipo.map((item, idx) => (
                  <div key={idx} className="hf-list-item hf-flex-between">
                    <div>
                      <div className="font-bold">{item.tipo}</div>
                      <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                        {item.cantidad} {item.cantidad === 1 ? 'posición' : 'posiciones'}
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div className="hf-metric-value-positive" style={{fontSize: '1.25rem', fontWeight: 'bold'}}>
                        {item.porcentaje.toFixed(1)}%
                      </div>
                      <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                        {formatCurrency(item.montoInvertido, 'ARS')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* By Currency */}
        <div className="hf-card">
          <h3 className="text-lg font-semibold mb-4">💱 Diversificación por Moneda</h3>
          {portfolioData.porMoneda.length === 0 ? (
            <div className="hf-empty-state">
              <p>No hay datos de diversificación</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={portfolioData.porMoneda}
                    dataKey="porcentaje"
                    nameKey="moneda"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({moneda, porcentaje}) => `${moneda}: ${porcentaje.toFixed(1)}%`}
                  >
                    {portfolioData.porMoneda.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6'][index % 2]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="hf-list" style={{marginTop: 'var(--hf-space-md)'}}>
                {portfolioData.porMoneda.map((item, idx) => (
                  <div key={idx} className="hf-list-item hf-flex-between">
                    <div>
                      <div className="font-bold">{item.moneda}</div>
                      <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                        {item.cantidad} {item.cantidad === 1 ? 'posición' : 'posiciones'}
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div className="hf-metric-value-positive" style={{fontSize: '1.25rem', fontWeight: 'bold'}}>
                        {item.porcentaje.toFixed(1)}%
                      </div>
                      <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                        {formatCurrency(item.montoInvertido, item.moneda)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Positions Table */}
      <div className="hf-card">
        <div style={{marginBottom: 'var(--hf-space-md)'}}>
          <h3 className="text-lg font-semibold">📋 Posiciones Actuales</h3>
        </div>
        {portfolioData.posiciones.length === 0 ? (
          <div className="hf-empty-state">
            <p>No tienes posiciones abiertas en este momento</p>
            <button className="hf-button hf-button-primary" onClick={() => onNavigate('inversiones')} style={{marginTop: 'var(--hf-space-md)'}}>
              Registrar Primera Inversión
            </button>
          </div>
        ) : (
          <div className="hf-table-container">
            <table className="hf-table">
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Tipo</th>
                  <th>Moneda</th>
                  <th>Cantidad</th>
                  <th>Precio Prom. Compra</th>
                  <th>Monto Invertido</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {portfolioData.posiciones.map((pos, idx) => {
                  return (
                    <tr key={idx}>
                      <td style={{fontWeight: '600'}}>
                        <div>{pos.activo}</div>
                        {pos.nombreActivo && pos.nombreActivo !== pos.activo && (
                          <div className="text-sm" style={{color: 'var(--hf-text-secondary)', fontWeight: 'normal'}}>
                            {pos.nombreActivo}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="hf-badge hf-badge-info">{pos.tipoActivo}</span>
                      </td>
                      <td style={{fontWeight: '500'}}>{pos.moneda}</td>
                      <td style={{fontWeight: '600'}}>{pos.cantidadRestante.toFixed(4)}</td>
                      <td>{formatCurrency(pos.promedioCompra, pos.moneda)}</td>
                      <td style={{fontWeight: 'bold', color: 'var(--hf-text-secondary)'}}>
                        {formatCurrency(pos.montoInvertido, pos.moneda)}
                      </td>
                      <td style={{color: 'var(--hf-accent-primary)', fontWeight: '500'}}>
                        {USER_NAMES[pos.usuarioId]?.split(' ')[0] || 'Usuario'}
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
  );
};

export default Portfolio;
