import type { ParseErrorCode } from '../../workers/parser-pipeline';

export type { ParseErrorCode };

export interface ErrorCopy {
  title: string;
  body: string;
  action?: string;
}

export const ERROR_COPY: Record<ParseErrorCode, ErrorCopy> = {
  not_nexus: {
    title: "This isn't a BEAST X tree",
    body: "We couldn't recognize this file as NEXUS or Newick. Open it in a text editor — it should start with #NEXUS.",
  },
  no_geo: {
    title: 'No geographic annotations',
    body: 'SpreadGL2 visualizes phylogeography, which needs location traits like location1/location2 (continuous) or region (discrete).',
    action: 'Re-run BEAST with a geographic prior, or try one of the examples.',
  },
  non_wgs84: {
    title: "Coordinates aren't WGS84",
    body: 'The coordinates in this tree look like a projected CRS (values out of lat/lon range). SpreadGL2 needs WGS84.',
    action: 'Reproject offline (e.g. with cs2cs) and reload.',
  },
  no_dates: {
    title: 'No tip dates',
    body: "We couldn't find dates in tip labels or annotations.",
    action: 'Try renaming tips to name|YYYY-MM-DD, or add a date annotation.',
  },
  needs_mrsd: {
    title: 'MRSD required',
    body: 'SpreadGL2 needs a most recent sampling date to anchor tree heights to calendar time.',
    action: 'Enter the MRSD as YYYY-MM-DD.',
  },
};
