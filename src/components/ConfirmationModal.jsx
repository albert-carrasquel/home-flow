import React from 'react';
import { X } from 'lucide-react';

const ConfirmationModal = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{background: 'rgba(11, 16, 32, 0.85)', backdropFilter: 'blur(4px)'}}>
    <div className="hf-card w-full max-w-sm transform transition-all" style={{animation: 'fadeIn 0.2s ease-out'}}>
      <div className="hf-flex-between" style={{borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 'var(--hf-space-md)', marginBottom: 'var(--hf-space-md)'}}>
        <h3 className="text-xl font-bold" style={{color: 'var(--hf-error)'}}>Confirmar Eliminación</h3>
        <button onClick={onCancel} style={{color: 'var(--hf-text-muted)', transition: 'color 150ms'}} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--hf-text-primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--hf-text-muted)'}>
          <X className="w-6 h-6" />
        </button>
      </div>
      <p style={{color: 'var(--hf-text-secondary)', marginBottom: 'var(--hf-space-lg)'}}>¿Estás seguro de que quieres eliminar esta transacción? Esta acción no se puede deshacer.</p>
      <div className="hf-flex" style={{justifyContent: 'flex-end', gap: 'var(--hf-space-sm)'}}>
        <button onClick={onCancel} className="hf-button hf-button-secondary">Cancelar</button>
        <button onClick={onConfirm} className="hf-button hf-button-danger">Eliminar</button>
      </div>
    </div>
  </div>
);

export default ConfirmationModal;
