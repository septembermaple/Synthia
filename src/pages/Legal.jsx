import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const TERMS = {
  title: '用户协议',
  body: `欢迎使用 Synthia AI 写真生成平台。请您在使用本服务前仔细阅读本协议。

一、服务说明
1. Synthia 为用户提供基于 AI 的图片再创作服务（以下简称"本服务"）。
2. 本服务依赖第三方大模型（如火山引擎豆包等）输出，结果不保证完全符合预期。

二、用户行为规范
1. 您承诺不利用本服务从事任何违反法律法规、公序良俗的行为。
2. 您承诺所上传的图片均已获得相关肖像权人 / 著作权人授权，且不包含未成年色情、暴力、毒品、政治敏感等违法内容。
3. 您不得以任何方式批量、自动、绕过限制使用本服务。

三、知识产权
1. 您对自行上传的素材保留全部权利。
2. 通过本服务生成的内容，您可在合法范围内使用，但不得用于侵权、欺诈或违法用途。

四、免责声明
1. 因第三方模型质量、网络异常等导致的生成失败、积分延迟到账等情况，平台将根据实际损失合理处理。
2. 因您违反本协议产生的任何责任由您自行承担。

五、变更与终止
1. 平台保留随时修改本协议的权利，更新会公示在产品内。
2. 您如不同意修改后的协议，应停止使用本服务。

如有疑问，请联系平台运营。`,
};

const PRIVACY = {
  title: '隐私政策',
  body: `Synthia 重视您的隐私。本政策说明我们如何收集、使用、存储与保护您的信息。

一、收集的信息
1. 注册信息：手机号（用于登录与计费）。
2. 使用信息：生成参数（场景、风格、提示词）、生成历史、积分变动记录。
3. 上传素材：您主动上传的图片，仅用于本次 AI 生成调用。

二、信息使用
1. 提供服务、计费、防欺诈、模型质量改进。
2. 在涉及行政机关、司法机关合法要求时配合提供必要信息。

三、信息存储
1. 用户基本信息存储在 Cloudflare D1（境内/境外区分根据账号配置）。
2. 生成结果默认保留 24 小时后过期清理；上传图片不长期持久化（仅作为请求转发）。
3. 您可通过"账号安全 → 注销账号"永久删除账号及关联数据。

四、Cookie / 本地存储
1. 我们仅在您的浏览器 localStorage 中保存登录 token 与刷新 token，便于自动登录。
2. 您可随时通过"退出登录"清除该信息。

五、第三方共享
1. 您的提示词与图片会发送给所选 AI 模型供应商以完成生成；除此之外不会出售给任何第三方。

六、未成年人保护
1. 本服务面向 14 岁以上用户。监护人发现未成年人未经同意使用本服务的，可联系我们删除其账号。

七、政策更新
本政策更新后会公示，您继续使用即视为同意。`,
};

export default function Legal() {
  const { type } = useParams();
  const navigate = useNavigate();
  const doc = type === 'privacy' ? PRIVACY : TERMS;

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px', lineHeight: 1.8 }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          padding: '6px 12px',
          borderRadius: 8,
          cursor: 'pointer',
          color: 'inherit',
          marginBottom: 16,
        }}
      >
        ← 返回
      </button>
      <h1 style={{ marginBottom: 16 }}>{doc.title}</h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{doc.body}</pre>
      <p style={{ marginTop: 32, opacity: 0.5, fontSize: 12 }}>
        本文档为通用模板，正式上线前请由法务团队审核并替换。
      </p>
    </div>
  );
}
