<?php

namespace Espo\Custom\Services;

use Espo\Core\Utils\Config;
use Espo\Entities\User;
use Espo\ORM\EntityManager;

/** Diseño de marca de los correos de la empresa (cabecera con logo o nombre, tarjeta con el mensaje, firma del usuario y pie). Lo usan el envío del Hub y cualquier correo que salga por EspoCRM. */
class EmailBrand
{
    public const MARK = 'data-ch-branded';

    public function __construct(private EntityManager $em, private Config $config) {}

    public function signature(User $user): string
    {
        $prefs = $this->em->getEntityById('Preferences', $user->getId());
        $custom = $prefs ? trim((string) $prefs->get('signature')) : '';
        if ($custom !== '') {
            return '<div data-ch-sig="1">' . $custom . '</div>';
        }
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        $name = $user->get('name') ?: $user->get('userName');
        $lines = [];
        $title = trim((string) $user->get('title'));
        $company = (string) $this->config->get('applicationName');
        if ($title !== '' || $company !== '') {
            $lines[] = '<span style="color:#5d6678">' . $e(trim($title . ($title !== '' && $company !== '' ? ' · ' : '') . $company)) . '</span>';
        }
        if ($user->get('phoneNumber')) {
            $lines[] = '<span style="color:#5d6678">Tel. ' . $e($user->get('phoneNumber')) . '</span>';
        }
        return '<div data-ch-sig="1" style="margin-top:18px;padding-top:12px;border-top:2px solid #4f63e8;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#161b2e">'
            . '<b style="font-size:14px">' . $e($name) . '</b>' . ($lines ? '<br>' . implode('<br>', $lines) : '') . '</div>';
    }

    public function wrap(string $body, User $user): string
    {
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        $company = (string) ($this->config->get('applicationName') ?: 'Crm Hub 360');
        $site = rtrim((string) $this->config->get('siteUrl'), '/');
        $logoId = (string) $this->config->get('companyLogoId');
        $brand = $logoId !== '' && $site !== ''
            ? '<img src="' . $e($site . '/?entryPoint=LogoImage&id=' . $logoId) . '" alt="' . $e($company) . '" height="40" style="display:block;height:40px;max-width:200px;border:0">'
            : '<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.2);text-align:center;font:800 18px Arial,sans-serif;color:#fff;line-height:38px">' . $e(mb_strtoupper(mb_substr($company, 0, 1))) . '</td>'
                . '<td style="padding-left:12px;font:700 19px Arial,Helvetica,sans-serif;color:#fff">' . $e($company) . '</td></tr></table>';
        return '<!doctype html><html><body style="margin:0;padding:0;background:#eef1f7" '.self::MARK.'="1">'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f7;padding:24px 10px"><tr><td align="center">'
            . '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe4f3">'
            . '<tr><td style="background:#2f43c4;background-image:linear-gradient(135deg,#2f43c4 0%,#5b5ff0 60%,#8b5cf6 100%);padding:22px 28px">' . $brand . '</td></tr>'
            . '<tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#161b2e">' . $body . '</td></tr>'
            . '<tr><td style="padding:0 28px 26px;font-family:Arial,Helvetica,sans-serif">' . $this->signature($user) . '</td></tr>'
            . '<tr><td style="background:#f4f6fc;border-top:1px solid #dfe4f3;padding:14px 28px;text-align:center;font:12px Arial,Helvetica,sans-serif;color:#7a8296">' . $e($company) . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }
}
