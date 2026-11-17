import { Button, Modal } from '../design/components';
import './Onboarding.css';
import { LIBRARY_CREDITS, LIMITS, LOCAL_CREDITS, ONLINE_CREDITS, type Credit } from './credits';

function CreditList({ items }: { items: Credit[] }) {
  return (
    <ul className="about__list">
      {items.map((c) => (
        <li key={c.name}>
          <a href={c.url} target="_blank" rel="noreferrer noopener">
            {c.name}
          </a>
          <span className="about__license">{c.license}</span>
          <br />
          <span className="muted">{c.use}</span>
          {c.note && (
            <>
              <br />
              <span className="muted">{c.note}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title="About TRIDGE"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <p>
        TRIDGE turns a picture or a few words into a low-poly 3D model, then rigs and animates it.
        It is free, runs in your browser, and has no account and no server of its own. Your projects
        stay on your device.
      </p>

      <h3>Good to know</h3>
      <ul className="about__list">
        {LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h3>Your privacy</h3>
      <p>
        Background removal, low poly, rigging, animation and export all happen on your device. Only
        when you ask for a 3D model from a picture, or a picture from words, is that picture or text
        sent to the free online model named below. If you add an API key it is kept in this browser
        only, and is never saved in a project or exported.
      </p>

      <h3>Online models (they receive what you send)</h3>
      <CreditList items={ONLINE_CREDITS} />

      <h3>Models that run on your device</h3>
      <CreditList items={LOCAL_CREDITS} />

      <h3>Built with</h3>
      <CreditList items={LIBRARY_CREDITS} />
    </Modal>
  );
}
