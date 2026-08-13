import React from 'react';

interface PropItem {
  onChange: (viewport: 'mobile' | 'tablet' | 'desktop') => void;
}

export const ViewportToggler: React.FC<PropItem> = ({
  onChange
}) => {
  return (
    <div className="jyinx-viewport-toggler">
      <button
        onClick={() => onChange('mobile')}
        className="jyinx-viewport-btn"
        title="Mobile View"
      >
        📱
      </button>
      <button
        onClick={() => onChange('tablet')}
        className="jyinx-viewport-btn"
        title="Tablet View"
      >
        📲
      </button>
      <button
        onClick={() => onChange('desktop')}
        className="jyinx-viewport-btn"
        title="Desktop View"
      >
        💻
      </button>
    </div>
  );
};