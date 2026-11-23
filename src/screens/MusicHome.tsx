import React from 'react';
import { MusicScreenOrchestrator } from '../features/music/MusicScreen.orchestrator';

export const MusicHome = ({ navigation }: any) => {
  return <MusicScreenOrchestrator navigation={navigation} />;
};

export default MusicHome;
