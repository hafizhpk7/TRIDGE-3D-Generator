import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ProgressBar, Tabs, Toggle } from '.';

describe('Toggle', () => {
  it('reports its state through role=switch', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Wireframe" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Wireframe' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Tabs', () => {
  function Demo() {
    const [v, setV] = useState('a');
    return (
      <Tabs
        ariaLabel="Demo"
        value={v}
        onChange={setV}
        tabs={[
          { id: 'a', label: 'A', content: 'Panel A' },
          { id: 'b', label: 'B', content: 'Panel B' },
        ]}
      />
    );
  }

  it('moves between tabs with the arrow keys', async () => {
    render(<Demo />);
    screen.getByRole('tab', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
  });
});

describe('Modal', () => {
  it('closes on Escape and traps focus', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Hello" onClose={onClose}>
        <button>Inside</button>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ProgressBar', () => {
  it('exposes a value, or none when indeterminate', () => {
    const { rerender } = render(<ProgressBar label="Work" value={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    rerender(<ProgressBar label="Work" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});
