import { useState } from 'react';

/** Saisie d'un PIN à 4 chiffres, au clavier physique ou à l'écran tactile. */
export function SaisiePin({
  onValider,
  desactive,
}: {
  onValider: (pin: string) => void;
  desactive?: boolean;
}) {
  const [pin, setPin] = useState('');
  const ajouter = (c: string) => {
    if (desactive) return;
    const p = (pin + c).slice(0, 4);
    setPin(p);
    if (p.length === 4) {
      onValider(p);
      setPin('');
    }
  };
  return (
    <div
      className="space-y-3 outline-none"
      tabIndex={0}
      autoFocus
      onKeyDown={(e) => {
        if (/^\d$/.test(e.key)) ajouter(e.key);
        if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      }}
    >
      <div className="flex justify-center gap-3" aria-label="PIN saisi">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-gray-700 ${i < pin.length ? 'bg-gray-700' : ''}`}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((c, i) =>
          c === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={desactive}
              className="rounded-lg border bg-white py-4 text-2xl font-medium hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
              onClick={() => (c === '⌫' ? setPin((p) => p.slice(0, -1)) : ajouter(c))}
            >
              {c}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
