import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Voyant } from '../src/components/Voyant';

describe('Voyant', () => {
  it('affiche le nombre de ventes en attente', () => {
    render(<Voyant etat="VENTES_EN_ATTENTE" enAttente={4} />);
    expect(screen.getByRole('status').textContent).toBe('Ventes en attente d’envoi (4)');
  });
});
