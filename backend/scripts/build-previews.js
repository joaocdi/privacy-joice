// Public previews are irreversibly blurred derivative images, never originals.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'previews');
const sources = [
  'Area_membro/0d43266a68de4f6398771f421cdc2ab6.jpeg',
  'Midias_Bloqueadas/565802ff-60bd-482f-bb3f-7a7ca2a48dbc.mp4',
  'Midias_Bloqueadas/6ef0d710-e591-4e27-8ca5-d06588b52907.mp4',
  'Midias_Bloqueadas/a1a71c2a-69d3-4f82-95d1-406581ecdcdf (2).mp4',
  'Midias_Bloqueadas/cd621ae2-b16a-4952-9fbc-65642a737736.mp4',
  'Midias_Bloqueadas/dba058a0-46d0-466e-97d4-a2d52d260a80.mp4',
  'Midias_Bloqueadas/c24b810d-b0cd-4cfc-b815-8600bdb79f93.mp4'
];
fs.mkdirSync(output, { recursive: true });
sources.forEach((relative, index) => {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) throw new Error('Missing source for preview ' + (index + 1));
  const target = path.join(output, 'post-' + String(index + 1).padStart(2, '0') + '.jpg');
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...(relative.endsWith('.mp4') ? ['-ss', '1'] : []), '-i', source,
    '-frames:v', '1', '-an', '-map_metadata', '-1',
    '-vf', 'scale=120:150:force_original_aspect_ratio=increase,crop=120:150,gblur=sigma=6:steps=3,scale=480:600:flags=bicubic',
    '-q:v', '4', target
  ], { stdio: 'pipe' });
  console.log(path.relative(root, target));
});
