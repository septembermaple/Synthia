const sceneGroups = [
  {
    name: '自然与户外',
    scenes: [
      { name: '森林秘境', style: '日系柔光' },
      { name: '海滩落日', style: '欧美时尚' },
      { name: '雪地公园', style: '韩系柔光' },
      { name: '午后花园', style: '唯美小清新' },
      { name: '极光之夜', style: '艺术质感' }
    ]
  },
  {
    name: '都市与现代',
    scenes: [
      { name: '职场办公室', style: '极简高级感' },
      { name: '天台顶层', style: '欧美时尚' },
      { name: '现代图书馆', style: '韩系柔光' },
      { name: '高端买手店', style: '欧美高级感' }
    ]
  },
  {
    name: '怀旧与复古',
    scenes: [
      { name: '复古街道', style: '港风胶片' },
      { name: '室内咖啡厅', style: '法式复古' },
      { name: '民国照相馆', style: '艺术质感' },
      { name: '老式剧院', style: '电影感' }
    ]
  },
  {
    name: '幻想与艺术',
    scenes: [
      { name: '高级影棚', style: '时尚杂志风' },
      { name: '赛博霓虹街', style: '艺术质感' },
      { name: '欧式古堡', style: '油画质感' },
      { name: '日式庭院', style: '日系柔光' }
    ]
  }
];

const visualStyles = [
  '法式复古',
  '日系小清新',
  '港风胶片',
  '欧美时尚',
  '极简高级感',
  '黑白电影',
  '油画质感',
  '韩系柔光',
  '唯美小清新',
  '电影感',
  '时尚杂志风'
];

function flattenScenes() {
  return sceneGroups.reduce((list, group) => {
    group.scenes.forEach((scene) => {
      list.push({
        label: `${group.name} / ${scene.name}`,
        value: `${group.name}|||${scene.name}`,
        group: group.name,
        name: scene.name,
        style: scene.style
      });
    });
    return list;
  }, []);
}

module.exports = {
  sceneGroups,
  visualStyles,
  flattenScenes
};
