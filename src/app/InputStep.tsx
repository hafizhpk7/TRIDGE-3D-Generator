import { useState } from 'react';
import { Tabs } from '../design/components';
import { InputPanel } from '../pipeline/input/InputPanel';
import { TextPanel } from '../pipeline/text/TextPanel';

/** The first step: choose how the model starts. Both panels stay mounted so work is not lost. */
export function InputStep() {
  const [tab, setTab] = useState('photo');
  return (
    <Tabs
      ariaLabel="Where the model comes from"
      value={tab}
      onChange={setTab}
      keepMounted
      tabs={[
        { id: 'photo', label: 'From photo', content: <InputPanel active={tab === 'photo'} /> },
        {
          id: 'text',
          label: 'From text',
          content: <TextPanel onUsePicture={() => setTab('photo')} />,
        },
      ]}
    />
  );
}
