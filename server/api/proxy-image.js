import { Hono } from 'hono';

const app = new Hono();

// 图片代理API - 解决跨域问题
app.get('/proxy-image', async (c) => {
    try {
      // 获取图片URL参数
      const imageUrl = c.req.query('url');

      if (!imageUrl) {
        return c.json({ error: '缺少图片URL参数' }, 400);
      }

      console.log('代理获取图片:', imageUrl);
          //获取图片的协议和域名，在referer中添加
          const imageUrlObj = new URL(imageUrl);

          const referer = imageUrlObj.protocol+'//' + imageUrlObj.host;
          console.log('referer:', referer);
      // 请求图片
      const response = await fetch(imageUrl, {
        headers: {
                  'User-Agent': c.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                  'Accept-Language': c.env.ACCEPT_LANGUAGE || 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
									'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                  'Referer': referer
        }
      });

      if (!response.ok) {
        return c.json({ error: '无法获取图片' }, 500);
      }


      // 获取图片内容类型
      const contentType = response.headers.get('content-type') || 'image/png';

      // 获取图片数据
      const imageData = await response.arrayBuffer();

      // 构造新的响应
      const newResponse = new Response(imageData, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });

      return newResponse;
    } catch (error) {
      console.error('代理图片错误:', error);
      return c.json({ error: '代理图片失败: ' + error.message }, 500);
    }
  });

export default app;
