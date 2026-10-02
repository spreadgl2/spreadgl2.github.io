// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogInspection } from '../../lib/log/log-table';
import {
  burnInSampleCount,
  type CurrentLog,
  LogImportModal,
  parseBurnInPercent,
} from './LogImportModal';

afterEach(() => {
  cleanup();
});

const BSSVS_INSPECTION: LogInspection = {
  columnNames: ['state', 'posterior', 'location.indicators.A.B', 'location.indicators.B.A'],
  sampleCount: 1001,
};

function logFile(name = 'run.log'): File {
  return new File(['state\tposterior\n0\t-1\n'], name, { type: 'text/plain' });
}

function renderModal(overrides: Partial<React.ComponentProps<typeof LogImportModal>> = {}) {
  const props = {
    treeStates: ['A', 'B'] as string[] | null,
    current: null as CurrentLog | null,
    inspect: vi.fn().mockResolvedValue(BSSVS_INSPECTION),
    load: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<LogImportModal {...props} />);
  return props;
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByTestId('log-file-input'), { target: { files: [file] } });
}

describe('burnInSampleCount', () => {
  it('matches the parser burn-in trimming', () => {
    expect(burnInSampleCount(1001, 0.1)).toBe(100);
    expect(burnInSampleCount(10, 0)).toBe(0);
  });
});

describe('parseBurnInPercent', () => {
  it('accepts percentages from 0 up to but excluding 100', () => {
    expect(parseBurnInPercent('0')).toBe(0);
    expect(parseBurnInPercent('12.5')).toBe(12.5);
    expect(parseBurnInPercent('99.9')).toBe(99.9);
  });

  it('rejects empty, negative, 100+ and non-numeric input', () => {
    for (const text of ['', ' ', '-1', '100', '250', 'abc']) {
      expect(parseBurnInPercent(text)).toBeNull();
    }
  });
});

describe('LogImportModal', () => {
  it('opens as a named dialog with the file chooser focused', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Load BEAST log' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('log-open-file'));
  });

  it('rejects files that are not .log without inspecting them', () => {
    const { inspect } = renderModal();
    chooseFile(logFile('tree.nex'));
    expect(screen.getByTestId('log-import-error').textContent).toBe('Expected a BEAST .log file.');
    expect(inspect).not.toHaveBeenCalled();
  });

  it('accepts dropped .log files', async () => {
    const { inspect } = renderModal();
    const file = logFile();
    fireEvent.drop(screen.getByTestId('log-drop-target'), { dataTransfer: { files: [file] } });
    expect(inspect).toHaveBeenCalledWith(file);
    expect(await screen.findByTestId('log-import-summary')).toBeTruthy();
  });

  it('summarizes the log before loading it', async () => {
    const { load } = renderModal();
    chooseFile(logFile());

    expect(await screen.findByTestId('log-import-summary')).toBeTruthy();
    expect(screen.getByTestId('log-summary-file').textContent).toBe('run.log');
    expect(screen.getByTestId('log-summary-samples').textContent).toBe('1,001');
    expect((screen.getByTestId('log-import-burnin') as HTMLInputElement).value).toBe('10');
    expect(screen.getByTestId('log-burnin-fraction').textContent).toBe('(100/1,001 samples)');
    expect(screen.getByTestId('log-summary-bssvs').textContent).toBe('location');
    expect(screen.getByTestId('log-summary-jumps').textContent).toBe('not found');
    expect(screen.queryByTestId('log-import-notice')).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId('log-import-confirm'));
  });

  it('loads the reviewed file and closes', async () => {
    const { load, onClose } = renderModal();
    const file = logFile();
    chooseFile(file);
    fireEvent.click(await screen.findByTestId('log-import-confirm'));
    expect(load).toHaveBeenCalledWith(file, 0.1, 1001);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('loads with the burn-in entered in the dialog', async () => {
    const { load } = renderModal();
    const file = logFile();
    chooseFile(file);
    const input = await screen.findByTestId('log-import-burnin');
    fireEvent.change(input, { target: { value: '25' } });
    expect(screen.getByTestId('log-burnin-fraction').textContent).toBe('(250/1,001 samples)');
    fireEvent.click(screen.getByTestId('log-import-confirm'));
    expect(load).toHaveBeenCalledWith(file, 0.25, 1001);
  });

  it('submits from the burn-in field with Enter', async () => {
    const { load } = renderModal();
    const file = logFile();
    chooseFile(file);
    const input = await screen.findByTestId('log-import-burnin');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(load).toHaveBeenCalledWith(file, 0, 1001);
  });

  it('blocks loading with an invalid burn-in', async () => {
    const { load } = renderModal();
    chooseFile(logFile());
    const input = await screen.findByTestId('log-import-burnin');
    fireEvent.change(input, { target: { value: '100' } });

    expect(screen.getByTestId('log-import-burnin-error').textContent).toMatch(/below 100%/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByTestId('log-burnin-fraction')).toBeNull();
    const confirm = screen.getByTestId('log-import-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the error when loading fails', async () => {
    const { onClose } = renderModal({
      load: vi.fn().mockRejectedValue(new Error('No rows remain after burn-in trimming')),
    });
    chooseFile(logFile());
    fireEvent.click(await screen.findByTestId('log-import-confirm'));

    expect((await screen.findByTestId('log-import-error')).textContent).toBe(
      'No rows remain after burn-in trimming',
    );
    expect(screen.getByTestId('log-import-summary')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns to the file chooser with the error when inspection fails', async () => {
    renderModal({
      inspect: vi.fn().mockRejectedValue(new Error('Log files may contain at most 4 columns.')),
    });
    chooseFile(logFile());
    expect((await screen.findByTestId('log-import-error')).textContent).toMatch(
      /at most 4 columns/,
    );
    expect(screen.getByTestId('log-open-file')).toBeTruthy();
  });

  it('warns when the BSSVS trait does not match the tree', async () => {
    renderModal({ treeStates: null });
    chooseFile(logFile());
    expect((await screen.findByTestId('log-import-notice')).textContent).toMatch(
      /this tree is continuous/,
    );
  });

  it('warns when the log offers no analyses', async () => {
    renderModal({
      inspect: vi.fn().mockResolvedValue({ columnNames: ['state', 'posterior'], sampleCount: 5 }),
    });
    chooseFile(logFile());
    expect((await screen.findByTestId('log-import-notice')).textContent).toMatch(
      /adds no analyses/,
    );
  });

  it('can go back to choose another file', async () => {
    renderModal();
    chooseFile(logFile());
    fireEvent.click(await screen.findByTestId('log-import-choose-another'));
    expect(screen.getByTestId('log-drop-target')).toBeTruthy();
    expect(screen.queryByTestId('log-import-summary')).toBeNull();
  });

  it('closes on Escape and Cancel, but not while loading', async () => {
    let resolveLoad: () => void = () => {};
    const { onClose } = renderModal({
      load: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveLoad = resolve;
          }),
      ),
    });
    chooseFile(logFile());
    fireEvent.click(await screen.findByTestId('log-import-confirm'));
    expect(screen.getByTestId('log-import-confirm').textContent).toBe('Loading…');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    resolveLoad();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps at least one sample for any burn-in below 100%', () => {
    expect(burnInSampleCount(1, 0.99)).toBe(0);
    expect(burnInSampleCount(1000, 0.999)).toBe(999);
  });

  describe('with a log already loaded', () => {
    const sourceFile = logFile('loaded.log');
    const loaded: CurrentLog = {
      fileName: 'loaded.log',
      columnNames: BSSVS_INSPECTION.columnNames,
      rowCount: 901,
      source: { file: sourceFile, sampleCount: 1001, burnInFraction: 0.1 },
    };

    it('opens on a summary of the current log', () => {
      renderModal({ current: loaded });
      expect(screen.getByRole('dialog', { name: 'BEAST log' })).toBeTruthy();
      expect(screen.getByTestId('log-summary-file').textContent).toBe('loaded.log');
      expect(screen.getByTestId('log-summary-samples').textContent).toBe('1,001');
      expect((screen.getByTestId('log-import-burnin') as HTMLInputElement).value).toBe('10');
      expect(screen.getByTestId('log-burnin-fraction').textContent).toBe('(100/1,001 samples)');
      expect(screen.getByTestId('log-summary-bssvs').textContent).toBe('location');
      expect(screen.queryByTestId('log-drop-target')).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('log-import-cancel'));
      expect(screen.getByTestId('log-import-cancel').textContent).toBe('Close');
    });

    it('re-applies a changed burn-in to the same file', async () => {
      const { load, onClose } = renderModal({ current: loaded });
      const apply = screen.getByTestId('log-import-apply') as HTMLButtonElement;
      expect(apply.disabled).toBe(true);

      fireEvent.change(screen.getByTestId('log-import-burnin'), { target: { value: '20' } });
      expect(apply.disabled).toBe(false);
      fireEvent.click(apply);

      expect(load).toHaveBeenCalledWith(sourceFile, 0.2, 1001);
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('removes the log', () => {
      const { onRemove, onClose } = renderModal({ current: loaded });
      fireEvent.click(screen.getByTestId('log-import-remove'));
      expect(onRemove).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('replaces via the file chooser, starting from the default burn-in', async () => {
      const { load } = renderModal({ current: loaded });
      fireEvent.change(screen.getByTestId('log-import-burnin'), { target: { value: '30' } });
      fireEvent.click(screen.getByTestId('log-import-replace'));

      expect(screen.getByTestId('log-drop-target')).toBeTruthy();
      expect(screen.getByText(/to replace loaded\.log/)).toBeTruthy();
      const file = logFile('new.log');
      chooseFile(file);
      expect(((await screen.findByTestId('log-import-burnin')) as HTMLInputElement).value).toBe(
        '10',
      );
      fireEvent.click(screen.getByTestId('log-import-confirm'));
      expect(load).toHaveBeenCalledWith(file, 0.1, 1001);
    });

    it('shows a project-restored log without editable burn-in', () => {
      renderModal({ current: { ...loaded, source: null } });
      expect(screen.getByTestId('log-summary-samples').textContent).toBe('901 after burn-in');
      expect(screen.getByTestId('log-summary-burnin').textContent).toMatch(/before the project/);
      expect(screen.queryByTestId('log-import-burnin')).toBeNull();
      expect(screen.queryByTestId('log-import-apply')).toBeNull();
      expect(screen.getByTestId('log-import-replace')).toBeTruthy();
    });
  });

  it('cancels from the file chooser', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('log-import-cancel'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
