[Unit]
Description=Crm Hub 360 - ejecutor del Centro de control
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${ROOT}
ExecStart=${ROOT}/bin/control-worker
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
