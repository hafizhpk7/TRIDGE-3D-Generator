import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Chip,
  ChipButton,
  EmptyState,
  IconButton,
  Modal,
  Panel,
  ProgressBar,
  Slider,
  Tabs,
  Toggle,
  useToast,
} from '../design/components';
import { ThemeToggle } from '../app/ThemeToggle';
import './Playground.css';

const COLORS = ['pink', 'orange', 'yellow', 'mint', 'sky', 'violet'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <div className="pg__row">{children}</div>
    </Panel>
  );
}

export function Playground() {
  const toast = useToast();
  const [slider, setSlider] = useState(40);
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState('one');
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div className="pg">
      <header className="pg__head">
        <h1>Playground</h1>
        <div className="pg__head-actions">
          <ThemeToggle />
          <Link to="/" className="btn btn--ghost">
            Back to app
          </Link>
        </div>
      </header>

      <div className="pg__grid">
        <Section title="Buttons">
          <Button>Make 3D model</Button>
          <Button variant="secondary">Add animation</Button>
          <Button variant="ghost">Download GLB</Button>
          <Button disabled>Disabled</Button>
          <Button variant="ghost" disabled>
            Disabled ghost
          </Button>
        </Section>

        <Section title="Icon buttons">
          <IconButton label="Reset view">↺</IconButton>
          <IconButton
            label="Auto-rotate"
            aria-pressed={pressed}
            onClick={() => setPressed((p) => !p)}
          >
            ⟳
          </IconButton>
          <IconButton label="Disabled" disabled>
            ✕
          </IconButton>
        </Section>

        <Section title="Slider">
          <div className="pg__wide">
            <Slider
              label="Detail"
              value={slider}
              min={0}
              max={100}
              onChange={setSlider}
              format={(v) => `${v}%`}
            />
            <Slider label="Disabled" value={60} min={0} max={100} onChange={() => {}} disabled />
          </div>
        </Section>

        <Section title="Toggle">
          <Toggle label="Auto-rotate" checked={on} onChange={setOn} />
          <Toggle label="Wireframe" checked={!on} onChange={(v) => setOn(!v)} />
          <Toggle label="Disabled" checked={false} onChange={() => {}} disabled />
        </Section>

        <Section title="Chips">
          {COLORS.map((c) => (
            <Chip key={c} color={c}>
              {c}
            </Chip>
          ))}
          <ChipButton color="mint">Walk</ChipButton>
          <ChipButton color="orange">Jump</ChipButton>
        </Section>

        <Section title="Tabs">
          <div className="pg__wide">
            <Tabs
              ariaLabel="Example tabs"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'one', label: 'One', content: <p>First tab. Use the arrow keys to move.</p> },
                { id: 'two', label: 'Two', content: <p>Second tab.</p> },
                { id: 'three', label: 'Three', content: <p>Third tab.</p> },
              ]}
            />
          </div>
        </Section>

        <Section title="Progress">
          <div className="pg__wide">
            <ProgressBar label="Example progress" value={65} />
            <ProgressBar label="Example empty progress" value={0} />
            <ProgressBar label="Waiting in queue" />
          </div>
        </Section>

        <Section title="Toast">
          <Button variant="ghost" onClick={() => toast.show('Your model is ready.', 'success')}>
            Success
          </Button>
          <Button variant="ghost" onClick={() => toast.show('Processing in the background.')}>
            Info
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.show(
                'Free GPU quota reached. Try again later or use the other provider.',
                'error',
              )
            }
          >
            Error
          </Button>
        </Section>

        <Section title="Modal">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Open modal
          </Button>
          <Modal
            open={open}
            title="Delete project?"
            onClose={() => setOpen(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Keep it
                </Button>
                <Button onClick={() => setOpen(false)}>Delete</Button>
              </>
            }
          >
            <p>This removes the project from this browser. It cannot be undone.</p>
          </Modal>
        </Section>

        <Section title="Empty state">
          <div className="pg__wide">
            <EmptyState title="No projects yet" action={<Button>Make 3D model</Button>}>
              Drop a picture of something you love.
            </EmptyState>
          </div>
        </Section>
      </div>
    </div>
  );
}
