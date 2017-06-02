#!/bin/bash
echo Starting Nginx
sed -Ei "s/APP_PORT/$PLATFORM_PORT_80_TCP_PORT/" /etc/nginx/sites-available/mattermost-ssl

ln -s /etc/nginx/sites-available/mattermost-ssl /etc/nginx/sites-enabled/mattermost-ssl
nginx -g 'daemon off;'
