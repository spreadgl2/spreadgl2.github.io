// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPipelineFromString } from '../../workers/parser-pipeline';
import { ImportSettingsModal } from './ImportSettingsModal';

const NEXUS = `#NEXUS
begin trees;
  tree T = [&R] ((TipA|2020-01-01[&location1=40.0,location2=-90.0]:1.0,TipB|2021-06-15[&location1=41.0,location2=-89.0]:1.0)[&location1=39.0,location2=-91.0]:1.0,(TipC|2020-07-04[&location1=38.0,location2=-92.0]:1.0,TipD|2021-12-31[&location1=37.0,location2=-93.0]:1.0)[&location1=36.0,location2=-94.0]:1.0)[&location1=38.0,location2=-92.0];
end;
`;

afterEach(cleanup);

describe('ImportSettingsModal — MRSD provenance', () => {
  it('shows the taxon, substring, and format that produced the MRSD', () => {
    const wire = runPipelineFromString(NEXUS);
    render(<ImportSettingsModal wire={wire} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText('TipD|2021-12-31')).toBeTruthy();
    expect(screen.getByText('YYYY-MM-DD')).toBeTruthy();
    expect(screen.getByText(/2021-12-31 \(2021\.\d+\)/)).toBeTruthy();
  });

  it('passes a decimal-year override to onConfirm as an ISO date', () => {
    const wire = runPipelineFromString(NEXUS);
    const onConfirm = vi.fn();
    render(<ImportSettingsModal wire={wire} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('import-mrsd-override'), { target: { value: '2022.0' } });
    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0].manualMrsdIso).toBe('2022-01-01');
  });

  it('passes an ISO override through verbatim', () => {
    const wire = runPipelineFromString(NEXUS);
    const onConfirm = vi.fn();
    render(<ImportSettingsModal wire={wire} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('import-mrsd-override'), {
      target: { value: '2023-03-15' },
    });
    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    expect(onConfirm.mock.calls[0]?.[0].manualMrsdIso).toBe('2023-03-15');
  });

  it('blocks confirm and shows an error for an unparseable override', () => {
    const wire = runPipelineFromString(NEXUS);
    const onConfirm = vi.fn();
    render(<ImportSettingsModal wire={wire} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByTestId('import-mrsd-override'), {
      target: { value: 'not-a-date' },
    });
    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('omits manualMrsdIso when the override is left blank', () => {
    const wire = runPipelineFromString(NEXUS);
    const onConfirm = vi.fn();
    render(<ImportSettingsModal wire={wire} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0].manualMrsdIso).toBeUndefined();
  });
});
