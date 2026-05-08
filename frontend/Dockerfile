# 前端纯静态资源，直接打进 nginx 镜像
FROM nginx:1.27-alpine

# 移除默认站点
RUN rm -f /etc/nginx/conf.d/default.conf

# 自定义站点配置（含 /api 与 /ws 反代到 backend 容器）
COPY nginx.conf /etc/nginx/conf.d/captail.conf
# 客服站点配置（www.captailcn-server.com，根目录由宿主 /usr/kefu 挂载）
COPY nginx-kefu.conf /etc/nginx/conf.d/kefu.conf

# 复制前端静态文件
COPY . /usr/share/nginx/html/

# 删除多余文件（避免上线源代码暴露 dockerfile 等）
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/.dockerignore \
          /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/nginx-kefu.conf

EXPOSE 80

# 默认兜底块对未知 Host 返 444，必须显式带正确 Host 才能命中真实站点
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- --header="Host: www.captailcn.com" http://127.0.0.1/ >/dev/null || exit 1
