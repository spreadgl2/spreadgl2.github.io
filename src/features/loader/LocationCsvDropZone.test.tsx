// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationCsvDropZone } from './LocationCsvDropZone';

afterEach(() => {
  cleanup();
});

const VALID_CSV = 'location,latitude,longitude\nGuangdong,23.13,113.27\nJiangxi,28.68,115.89\n';

describe('LocationCsvDropZone', () => {
  it('renders error state with value count and drop target', () => {
    render(<LocationCsvDropZone valueCount={14} onLookup={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByTestId('location-csv-drop-zone')).toBeTruthy();
    expect(screen.getByTestId('csv-drop-target')).toBeTruthy();
    expect(screen.getByText(/14 distinct values/)).toBeTruthy();
  });

  it('warns when internal nodes lack the selected location annotation', () => {
    render(
      <LocationCsvDropZone
        valueCount={7}
        traitName="location_rate"
        missingAnnotationCount={14}
        onLookup={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    const notice = screen.getByTestId('missing-location-annotations-notice');
    expect(notice.textContent).toContain('14 internal nodes have no location_rate annotation');
    expect(notice.textContent).toContain('Branches touching them will be omitted from the map');
  });

  it('calls onSkip when continuing without coordinates', () => {
    const onSkip = vi.fn();
    render(<LocationCsvDropZone valueCount={14} onLookup={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByTestId('csv-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('reports how many states the built-in gazetteer matched, and offers to keep them', async () => {
    // Argentina + Uruguay are in the gazetteer; Nowhereland is not → 2 of 3.
    render(
      <LocationCsvDropZone
        valueCount={3}
        values={['Argentina', 'Uruguay', 'Nowhereland']}
        onLookup={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('gazetteer-match-summary').textContent).toBe('2 of 3');
    });
    // The skip button reflects that continuing keeps the matched locations.
    expect(screen.getByTestId('csv-skip').textContent).toContain('matched locations');
  });

  it('reports zero gazetteer matches with the plain continue label', async () => {
    render(
      <LocationCsvDropZone
        valueCount={2}
        values={['Nowhereland', 'Faketopia']}
        onLookup={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('gazetteer-match-summary').textContent).toBe('0 of 2');
    });
    expect(screen.getByTestId('csv-skip').textContent).toContain('without coordinates');
  });

  it('reviews a valid CSV before calling onLookup', async () => {
    const onLookup = vi.fn();
    render(<LocationCsvDropZone valueCount={2} onLookup={onLookup} onSkip={vi.fn()} />);

    const dropTarget = screen.getByTestId('csv-drop-target');
    const file = new File([VALID_CSV], 'locations.csv', { type: 'text/csv' });

    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });

    expect(screen.getByText('Column names')).toBeTruthy();
    expect(screen.getByText('Detected')).toBeTruthy();
    expect(onLookup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('csv-column-confirm'));

    await waitFor(() => {
      expect(onLookup).toHaveBeenCalledOnce();
    });

    const mapping = onLookup.mock.calls[0]?.[0] as Map<string, [number, number]>;
    expect(mapping instanceof Map).toBe(true);
    expect(mapping.get('Guangdong')).toEqual([23.13, 113.27]);
    expect(mapping.get('Jiangxi')).toEqual([28.68, 115.89]);
  });

  it('opens and processes a locations file without drag and drop', async () => {
    const onLookup = vi.fn();
    render(<LocationCsvDropZone valueCount={2} onLookup={onLookup} onSkip={vi.fn()} />);
    const fileInput = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByTestId('csv-open-file'));
    expect(clickSpy).toHaveBeenCalledOnce();

    const file = new File([VALID_CSV], 'locations.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });
  });

  it('shows column picker modal when CSV columns are ambiguous', async () => {
    const onLookup = vi.fn();
    render(<LocationCsvDropZone valueCount={2} onLookup={onLookup} onSkip={vi.fn()} />);

    const ambiguousCsv = 'location,col_a,col_b,col_c\nFoo,1,2,3\nBar,4,5,6\n';
    const dropTarget = screen.getByTestId('csv-drop-target');
    const file = new File([ambiguousCsv], 'locations.csv', { type: 'text/csv' });

    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });
    expect(onLookup).not.toHaveBeenCalled();
  });

  it('reviews a headerless TSV with default second and third coordinate columns', async () => {
    const onLookup = vi.fn();
    render(
      <LocationCsvDropZone
        valueCount={2}
        values={['Arizona', 'California']}
        onLookup={onLookup}
        onSkip={vi.fn()}
      />,
    );

    const tsv = 'Arizona\t33.7712\t-111.3877\nCalifornia\t36.17\t-119.7462\n';
    const dropTarget = screen.getByTestId('csv-drop-target');
    const file = new File([tsv], 'locations.txt', { type: 'text/plain' });

    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });

    expect(screen.getByText('Not detected')).toBeTruthy();
    expect((screen.getByTestId('lat-col-select') as HTMLSelectElement).value).toBe('Column 2');
    expect((screen.getByTestId('lon-col-select') as HTMLSelectElement).value).toBe('Column 3');
  });

  it('calls onLookup after confirming columns in ambiguous modal', async () => {
    const onLookup = vi.fn();
    render(<LocationCsvDropZone valueCount={2} onLookup={onLookup} onSkip={vi.fn()} />);

    const ambiguousCsv = 'region,x,y,z\nAlpha,23.0,113.0,0\nBeta,28.0,115.0,0\n';
    const dropTarget = screen.getByTestId('csv-drop-target');
    const file = new File([ambiguousCsv], 'locations.csv', { type: 'text/csv' });

    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('csv-column-confirm'));

    await waitFor(() => {
      expect(onLookup).toHaveBeenCalledOnce();
    });
  });
});

describe('LocationCsvDropZone drag state', () => {
  it('applies dragging style on dragover and removes on dragleave', () => {
    render(<LocationCsvDropZone valueCount={5} onLookup={vi.fn()} onSkip={vi.fn()} />);
    const dropTarget = screen.getByTestId('csv-drop-target');

    fireEvent.dragOver(dropTarget, { dataTransfer: {} });
    expect(dropTarget.className).toContain('dropZoneDragging');

    fireEvent.dragLeave(dropTarget);
    expect(dropTarget.className).not.toContain('dropZoneDragging');
  });
});
