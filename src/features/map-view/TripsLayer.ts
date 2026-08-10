// Adapted from deck.gl's TripsLayer 9.3.7.
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type { AccessorFunction, DefaultProps } from '@deck.gl/core';
import { PathLayer, type PathLayerProps } from '@deck.gl/layers';

type TripsUniformProps = {
  fadeTrail: boolean;
  trailLength: number;
  currentTime: number;
};

const uniformBlock = `\
layout(std140) uniform tripsUniforms {
  bool fadeTrail;
  float trailLength;
  float currentTime;
} trips;
`;

const tripsUniforms = {
  name: 'trips',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    fadeTrail: 'f32',
    trailLength: 'f32',
    currentTime: 'f32',
  },
} as const;

type TripsLayerSpecificProps<DataT> = {
  fadeTrail?: boolean;
  trailLength?: number;
  currentTime?: number;
  getTimestamps?: AccessorFunction<DataT, number[]>;
};

export type TripsLayerProps<DataT = unknown> = TripsLayerSpecificProps<DataT> &
  PathLayerProps<DataT>;

const defaultProps: DefaultProps<TripsLayerProps> = {
  fadeTrail: true,
  trailLength: { type: 'number', value: 120, min: 0 },
  currentTime: { type: 'number', value: 0, min: 0 },
  getTimestamps: {
    type: 'accessor',
    value: (d: unknown) => (d as { timestamps: number[] }).timestamps,
  },
};

/** Animated paths with a time-gated, optionally fading trail. */
export class TripsLayer<DataT = unknown, ExtraProps extends object = object> extends PathLayer<
  DataT,
  Required<TripsLayerSpecificProps<DataT>> & ExtraProps
> {
  static layerName = 'TripsLayer';
  static defaultProps = defaultProps;

  getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      'vs:#decl': `\
in float instanceTimestamps;
in float instanceNextTimestamps;
out float vTime;
`,
      'vs:#main-end': `\
vTime = instanceTimestamps + (instanceNextTimestamps - instanceTimestamps) * vPathPosition.y / vPathLength;
`,
      'fs:#decl': `\
in float vTime;
`,
      'fs:#main-start': `\
if(vTime > trips.currentTime || (trips.fadeTrail && (vTime < trips.currentTime - trips.trailLength))) {
  discard;
}
`,
      'fs:DECKGL_FILTER_COLOR': `\
if(trips.fadeTrail) {
  color.a *= 1.0 - (trips.currentTime - vTime) / trips.trailLength;
}
`,
    };
    shaders.modules = [...shaders.modules, tripsUniforms];
    return shaders;
  }

  initializeState(): void {
    super.initializeState();

    this.getAttributeManager()?.addInstanced({
      timestamps: {
        size: 1,
        accessor: 'getTimestamps',
        shaderAttributes: {
          instanceTimestamps: { vertexOffset: 0 },
          instanceNextTimestamps: { vertexOffset: 1 },
        },
      },
    });
  }

  draw(params: Parameters<PathLayer<DataT>['draw']>[0]): void {
    const { fadeTrail, trailLength, currentTime } = this.props;
    const uniforms: TripsUniformProps = { fadeTrail, trailLength, currentTime };
    this.state.model?.shaderInputs.setProps({ trips: uniforms });
    super.draw(params);
  }
}
