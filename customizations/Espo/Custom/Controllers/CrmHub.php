<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Acl;
use Espo\Core\Api\Request;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Select\SelectBuilderFactory;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Config\ConfigWriter;
use Espo\Core\Utils\Metadata;
use Espo\Custom\Services\HubClient;
use Espo\Custom\Services\LeadAssigner;
use Espo\Entities\User;
use Espo\ORM\EntityManager;

/** Panel de integraciones, asignación automática y reasignación de Crm Hub 360. */
class CrmHub
{
    private const REASSIGNABLE = ['Lead', 'Contact', 'Account', 'Opportunity'];
    private const SETTING_KEYS = ['fb_page_token', 'services', 'forms', 'wa_provider', 'evolution_url', 'evolution_apikey', 'evolution_instance',
        'meta_phone_number_id', 'meta_access_token', 'meta_app_secret', 'gupshup_api_key', 'gupshup_source', 'gupshup_app_name',
        'telegram_bot_token', 'telegram_welcome', 'twilio_account_sid', 'twilio_auth_token', 'twilio_sms_from', 'twilio_wa_from', 'twilio_voice_from',
        'sms_provider', 'voice_provider', 'voice_record', 'generic_whatsapp', 'generic_sms', 'generic_voice'];

    public function __construct(
        private User $user,
        private Config $config,
        private Acl $acl,
        private EntityManager $em,
        private SelectBuilderFactory $selectBuilderFactory,
        private Metadata $metadata,
        private ConfigWriter $configWriter
    ) {}

    private function admin(): void
    {
        if (!$this->user->isAdmin()) {
            throw new Forbidden();
        }
    }

    private function hub(): HubClient
    {
        $this->admin();
        return new HubClient($this->config);
    }

    /** 'all' | 'team' | 'no' */
    private function assignmentLevel(): string
    {
        return $this->user->isAdmin() ? 'all' : ($this->acl->getPermissionLevel('assignmentPermission') ?: 'no');
    }

    // ---------- Integraciones (Hub Service) ----------
    public function getActionIntegrations(Request $request): \stdClass
    {
        return (object) $this->hub()->request('GET', '/v1/tenant/settings');
    }

    public function putActionIntegrations(Request $request): \stdClass
    {
        $data = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $allowed = array_intersect_key($data, array_flip(self::SETTING_KEYS));
        try {
            return (object) $this->hub()->request('PUT', '/v1/tenant/settings', $allowed);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'HTTP 422')) {
                preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
                throw new BadRequest($m[1] ?? 'Valores inválidos');
            }
            throw $e;
        }
    }

    public function postActionResetServices(Request $request): \stdClass
    {
        return (object) $this->hub()->request('POST', '/v1/tenant/settings/reset-services', []);
    }

    // ---------- Asignación automática (solo administradores) ----------
    public function getActionAssignment(Request $request): \stdClass
    {
        $this->admin();
        $assigner = new LeadAssigner($this->em, $this->config);
        $teamName = [];
        foreach ($this->em->getRDBRepository('Team')->find() as $t) {
            $teamName[$t->getId()] = $t->get('name');
        }
        $users = [];
        foreach ($this->em->getRDBRepository(User::ENTITY_TYPE)->where(['isActive' => true, 'type' => ['regular', 'admin']])->find() as $u) {
            $users[] = [
                'id' => $u->getId(), 'name' => $u->get('name') ?: $u->get('userName'), 'userName' => $u->get('userName'),
                'teams' => array_values(array_map(fn ($id) => $teamName[$id] ?? $id, $u->getLinkMultipleIdList('teams'))),
                'receivesLeads' => (bool) $u->get('receivesLeads'), 'openLeads' => $assigner->openLeads($u->getId()),
            ];
        }
        $eligible = $assigner->eligibleUsers();
        $campaigns = [];
        foreach ($this->em->getRDBRepository('Campaign')->where(['status' => ['Planning', 'Active']])->find() as $c) {
            $tids = $c->getLinkMultipleIdList('teams');
            $campaigns[] = [
                'id' => $c->getId(), 'name' => $c->get('name'),
                'teams' => array_values(array_map(fn ($id) => $teamName[$id] ?? $id, $tids)),
                'eligible' => count(array_filter($eligible, fn (User $u) => array_intersect($tids, $u->getLinkMultipleIdList('teams')))),
            ];
        }
        return (object) ['users' => $users, 'campaigns' => $campaigns, 'eligibleTotal' => count($eligible),
                         'method' => $assigner->method(), 'cap' => $assigner->cap()];
    }

    public function putActionAssignment(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        $method = (string) ($d->method ?? 'balanced');
        $cap = (int) ($d->cap ?? 0);
        if (!in_array($method, ['balanced', 'roundrobin'], true) || $cap < 0 || $cap > 10000) {
            throw new BadRequest('Valores inválidos.');
        }
        $this->configWriter->setMultiple(['crmhubAssignMethod' => $method, 'crmhubAssignCap' => $cap]);
        $this->configWriter->save();
        return (object) ['ok' => true];
    }

    // ---------- Estados del pipeline de leads ----------
    private const PIPELINE_DEFAULTS = ['new' => 'Nuevo Lead', 'review' => 'En Calificación', 'qualified' => 'Calificado'];

    /** Lo lee cualquier usuario autenticado (incluido el usuario API del Hub). */
    public function getActionPipeline(Request $request): \stdClass
    {
        $options = array_values($this->metadata->get(['entityDefs', 'Lead', 'fields', 'status', 'options'], []));
        $closed = $this->config->get('crmhubClosedStatuses');
        $assigner = new LeadAssigner($this->em, $this->config);
        return (object) [
            'options' => $options,
            'new' => $this->config->get('crmhubStatusNew') ?: self::PIPELINE_DEFAULTS['new'],
            'review' => $this->config->get('crmhubStatusReview') ?: self::PIPELINE_DEFAULTS['review'],
            'qualified' => $this->config->get('crmhubStatusQualified') ?: self::PIPELINE_DEFAULTS['qualified'],
            'closed' => is_array($closed) && $closed ? array_values($closed) : LeadAssigner::DEFAULT_CLOSED,
            'ignored' => $this->metadata->get(['scopes', 'Lead', 'kanbanStatusIgnoreList'], []),
        ];
    }

    public function putActionPipeline(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        $options = $this->metadata->get(['entityDefs', 'Lead', 'fields', 'status', 'options'], []);
        $new = (string) ($d->new ?? ''); $review = (string) ($d->review ?? ''); $qualified = (string) ($d->qualified ?? '');
        $closed = array_values(array_filter((array) ($d->closed ?? [])));
        foreach (array_merge([$new, $review, $qualified], $closed) as $st) {
            if (!in_array($st, $options, true)) {
                throw new BadRequest("El estado «{$st}» no existe en la lista de estados de Lead.");
            }
        }
        $this->configWriter->setMultiple(['crmhubStatusNew' => $new, 'crmhubStatusReview' => $review,
                                          'crmhubStatusQualified' => $qualified, 'crmhubClosedStatuses' => $closed]);
        $this->configWriter->save();
        return (object) ['ok' => true];
    }

    // ---------- Reasignación (admin, directores y gerentes según su permiso de asignación) ----------
    public function getActionAssignees(Request $request): array
    {
        $level = $this->assignmentLevel();
        if ($level === 'no') {
            throw new Forbidden('No tienes permiso para reasignar.');
        }
        $assigner = new LeadAssigner($this->em, $this->config);
        $myTeams = $this->user->getLinkMultipleIdList('teams');
        $out = [];
        foreach ($this->em->getRDBRepository(User::ENTITY_TYPE)->where(['isActive' => true, 'type' => ['regular', 'admin']])->find() as $u) {
            if ($level === 'team' && $u->getId() !== $this->user->getId() && !array_intersect($myTeams, $u->getLinkMultipleIdList('teams'))) {
                continue;
            }
            $out[] = ['id' => $u->getId(), 'name' => $u->get('name') ?: $u->get('userName'),
                      'openLeads' => $assigner->openLeads($u->getId()), 'receivesLeads' => (bool) $u->get('receivesLeads')];
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        return $out;
    }

    public function postActionReassign(Request $request): \stdClass
    {
        $level = $this->assignmentLevel();
        if ($level === 'no') {
            throw new Forbidden('No tienes permiso para reasignar.');
        }
        $d = $request->getParsedBody();
        $type = (string) ($d->entityType ?? '');
        $ids = array_values(array_filter((array) ($d->ids ?? [])));
        $target = (string) ($d->userId ?? '');
        $note = trim((string) ($d->note ?? ''));
        if (!in_array($type, self::REASSIGNABLE, true) || !$ids || $target === '') {
            throw new BadRequest('Selecciona los registros y el destinatario.');
        }
        $assigner = new LeadAssigner($this->em, $this->config);
        $fixed = null;
        if ($target !== 'auto') {
            $fixed = $this->em->getEntityById(User::ENTITY_TYPE, $target);
            if (!$fixed || !$fixed->get('isActive')) {
                throw new BadRequest('Usuario destino inválido.');
            }
            if ($level === 'team' && $fixed->getId() !== $this->user->getId()
                && !array_intersect($this->user->getLinkMultipleIdList('teams'), $fixed->getLinkMultipleIdList('teams'))) {
                throw new Forbidden('Solo puedes reasignar a usuarios de tus equipos.');
            }
        }
        $done = 0;
        $skipped = [];
        foreach ($ids as $id) {
            $e = $this->em->getEntityById($type, $id);
            if (!$e || !$this->acl->checkEntityEdit($e)) {
                $skipped[] = $id;
                continue;
            }
            $to = $fixed ?? $assigner->pick($type === 'Lead' ? $e->get('campaignId') : null);
            if (!$to) {
                throw new BadRequest('No hay usuarios habilitados para recibir leads. Actívalos en Integraciones → Asignación automática.');
            }
            $from = (string) $e->get('assignedUserName');
            $assigner->assign($e, $to);
            $this->em->saveEntity($e, ['skipAutoAssign' => true, 'skipHubHook' => true]);
            $this->em->createEntity('Note', [
                'type' => 'Post', 'parentType' => $type, 'parentId' => $id,
                'post' => 'Reasignado de ' . ($from ?: 'sin asesor') . ' a ' . ($to->get('name') ?: $to->get('userName'))
                    . ' por ' . ($this->user->get('name') ?: $this->user->get('userName'))
                    . ($target === 'auto' ? ' (asignación balanceada)' : '') . ($note !== '' ? '. Motivo: ' . $note : '.'),
            ]);
            $done++;
        }
        return (object) ['done' => $done, 'skipped' => $skipped];
    }

    // ---------- Panel gerencial: métricas con el alcance (ACL) del usuario que consulta ----------
    private const PIPELINE = ['Nuevo Lead', 'En Calificación', 'Calificado', 'En Enfriamiento/Contactado', 'Cierre Exitoso'];

    public function getActionMetrics(Request $request): \stdClass
    {
        $days = (int) ($request->getQueryParam('days') ?: 30);
        $days = in_array($days, [7, 30, 90, 365], true) ? $days : 30;
        $now = time();
        $from = gmdate('Y-m-d H:i:s', $now - $days * 86400);
        $today = gmdate('Y-m-d 00:00:00');

        $builder = $this->selectBuilderFactory->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder();
        $builder->select(['id', 'status', 'source', 'assignedUserId', 'createdAt', 'totalDebt', 'overdueDebt',
                          'qualificationStatus', 'suggestedService', 'campaignId'])->limit(0, 30000);
        $leads = iterator_to_array($this->em->getRDBRepository('Lead')->clone($builder->build())->find(), false);

        $names = [];
        foreach ($this->em->getRDBRepository(User::ENTITY_TYPE)->select(['id', 'name', 'userName'])->find() as $u) {
            $names[$u->getId()] = $u->get('name') ?: $u->get('userName');
        }
        $camps = [];
        foreach ($this->em->getRDBRepository('Campaign')->select(['id', 'name'])->find() as $c) {
            $camps[$c->getId()] = $c->get('name');
        }

        $assigner = new LeadAssigner($this->em, $this->config);
        $closedList = $assigner->closedStatuses();
        $ignored = $this->metadata->get(['scopes', 'Lead', 'kanbanStatusIgnoreList'], []);
        $stages = array_values(array_diff($this->metadata->get(['entityDefs', 'Lead', 'fields', 'status', 'options'], self::PIPELINE), $ignored));
        $k = ['leads' => 0, 'nuevosHoy' => 0, 'sinAsesor' => 0, 'evaluados' => 0, 'califican' => 0, 'cierres' => 0,
              'deudaTotal' => 0, 'deudaMora' => 0, 'abiertos' => 0];
        $estado = array_fill_keys($stages, 0);
        $servicio = $origen = $campana = $asesor = [];
        $bucket = max(1, (int) ceil($days / 30));
        $trend = [];
        for ($i = (int) ceil($days / $bucket) - 1; $i >= 0; $i--) {
            $trend[gmdate('Y-m-d', $now - $i * $bucket * 86400)] = 0;
        }
        $trendKeys = array_keys($trend);

        foreach ($leads as $l) {
            $status = (string) $l->get('status');
            $closed = in_array($status, $closedList, true);
            if (!$closed) {
                $k['abiertos']++;
            }
            $k['deudaTotal'] += (float) $l->get('totalDebt');
            $k['deudaMora'] += (float) $l->get('overdueDebt');
            if (isset($estado[$status])) {
                $estado[$status]++;
            }
            $created = (string) $l->get('createdAt');
            if ($created >= $today) {
                $k['nuevosHoy']++;
            }
            if ($created < $from) {
                continue; // el resto son métricas de los leads captados en el periodo
            }
            $k['leads']++;
            $uid = $l->get('assignedUserId');
            if (!$uid) {
                $k['sinAsesor']++;
            }
            $q = (string) $l->get('qualificationStatus');
            if ($q !== '') {
                $k['evaluados']++;
                if ($q === 'Califica') {
                    $k['califican']++;
                    $svc = trim(explode(' (', (string) $l->get('suggestedService'))[0]);
                    $servicio[$svc ?: 'Sin servicio'] = ($servicio[$svc ?: 'Sin servicio'] ?? 0) + 1;
                }
            }
            $won = $status === ($closedList[0] ?? 'Cierre Exitoso');
            $k['cierres'] += $won ? 1 : 0;
            $src = (string) ($l->get('source') ?: 'Sin origen');
            $origen[$src] = ($origen[$src] ?? 0) + 1;
            if ($cid = $l->get('campaignId')) {
                $cn = $camps[$cid] ?? 'Campaña';
                $campana[$cn] = ($campana[$cn] ?? 0) + 1;
            }
            $an = $uid ? ($names[$uid] ?? $uid) : 'Sin asesor';
            $asesor[$an] ??= ['name' => $an, 'leads' => 0, 'califican' => 0, 'cierres' => 0];
            $asesor[$an]['leads']++;
            $asesor[$an]['califican'] += $q === 'Califica' ? 1 : 0;
            $asesor[$an]['cierres'] += $won ? 1 : 0;
            $day = substr($created, 0, 10);
            for ($i = count($trendKeys) - 1; $i >= 0; $i--) {
                if ($day >= $trendKeys[$i]) {
                    $trend[$trendKeys[$i]]++;
                    break;
                }
            }
        }
        $rank = function (array $a, int $n = 8) {
            arsort($a);
            return array_map(fn ($name, $v) => ['name' => $name, 'value' => $v], array_keys(array_slice($a, 0, $n, true)), array_slice($a, 0, $n, true));
        };
        usort($asesor, fn ($a, $b) => [$b['cierres'], $b['califican'], $b['leads']] <=> [$a['cierres'], $a['califican'], $a['leads']]);
        $pct = fn (int $a, int $b) => $b > 0 ? round(100 * $a / $b, 1) : 0;

        return (object) [
            'days' => $days,
            'kpi' => $k + ['tasaCalificacion' => $pct($k['califican'], $k['evaluados']), 'tasaCierre' => $pct($k['cierres'], $k['leads'])],
            'estado' => array_map(fn ($n, $v) => ['name' => $n, 'value' => $v], array_keys($estado), array_values($estado)),
            'servicio' => $rank($servicio), 'origen' => $rank($origen), 'campanas' => $rank($campana, 6),
            'asesores' => array_slice($asesor, 0, 8),
            'tendencia' => array_map(fn ($d, $v) => ['day' => $d, 'value' => $v], array_keys($trend), array_values($trend)),
            'bucketDays' => $bucket,
            'scope' => $this->user->isAdmin() ? 'all' : ($this->acl->getPermissionLevel('assignmentPermission') ?: 'no'),
        ];
    }

    // ---------- Organigrama: gerentes -> equipos (directores y asesores), derivado de roles y equipos ----------
    public function getActionOrgchart(Request $request): \stdClass
    {
        $level = $this->assignmentLevel();
        if ($level === 'no') {
            throw new Forbidden();
        }
        $assigner = new LeadAssigner($this->em, $this->config);
        $roleName = [];
        foreach ($this->em->getRDBRepository('Role')->find() as $r) {
            $roleName[$r->getId()] = $r->get('name');
        }
        $myTeams = $this->user->getLinkMultipleIdList('teams');
        $teams = [];
        foreach ($this->em->getRDBRepository('Team')->find() as $t) {
            if ($level === 'team' && !in_array($t->getId(), $myTeams, true)) {
                continue;
            }
            $camps = [];
            foreach ($this->em->getRDBRepository('Campaign')->where(['status' => ['Planning', 'Active']])->find() as $c) {
                if (in_array($t->getId(), $c->getLinkMultipleIdList('teams'), true)) {
                    $camps[] = $c->get('name');
                }
            }
            $teams[$t->getId()] = ['id' => $t->getId(), 'name' => $t->get('name'), 'directors' => [], 'members' => [], 'campaigns' => $camps];
        }
        $managers = [];
        $unassigned = [];
        foreach ($this->em->getRDBRepository(User::ENTITY_TYPE)->where(['isActive' => true, 'type' => ['regular', 'admin']])->find() as $u) {
            $roles = array_values(array_filter(array_map(fn ($id) => $roleName[$id] ?? null, $u->getLinkMultipleIdList('roles'))));
            $row = ['id' => $u->getId(), 'name' => $u->get('name') ?: $u->get('userName'), 'userName' => $u->get('userName'),
                    'roles' => $u->isAdmin() ? array_values(array_unique(array_merge(['Administrador'], $roles))) : $roles,
                    'receivesLeads' => (bool) $u->get('receivesLeads'), 'openLeads' => $assigner->openLeads($u->getId())];
            $isManager = $u->isAdmin() || in_array('Gerente General', $roles, true);
            $isDirector = in_array('Director de Equipo', $roles, true);
            if ($isManager) {
                if ($level === 'all') {
                    $managers[] = $row;
                }
                continue;
            }
            $placed = false;
            foreach ($u->getLinkMultipleIdList('teams') as $tid) {
                if (isset($teams[$tid])) {
                    $teams[$tid][$isDirector ? 'directors' : 'members'][] = $row;
                    $placed = true;
                }
            }
            if (!$placed && $level === 'all') {
                $unassigned[] = $row;
            }
        }
        $teams = array_values($teams);
        foreach ($teams as &$t) {
            $t['openLeads'] = array_sum(array_map(fn ($m) => $m['openLeads'], array_merge($t['directors'], $t['members'])));
        }
        return (object) ['managers' => $managers, 'teams' => $teams, 'unassigned' => $unassigned,
                         'canManage' => $this->user->isAdmin()];
    }

    // ---------- WhatsApp (envío) y llamadas ----------
    public function postActionWhatsappQr(Request $request): \stdClass
    {
        try {
            return (object) $this->hub()->request('POST', '/v1/whatsapp/qr', []);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo obtener el código QR.');
        }
    }

    public function postActionWhatsappTest(Request $request): \stdClass
    {
        try {
            return (object) $this->hub()->request('POST', '/v1/whatsapp/test', []);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo probar la conexión.');
        }
    }

    public function postActionWhatsappSend(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/whatsapp/send', [
                'leadId' => $lead->getId(), 'text' => (string) ($d->text ?? ''),
                'agent' => $this->user->get('name') ?: $this->user->get('userName'),
            ], 30);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo enviar el mensaje.');
        }
    }

    /** Registra una llamada saliente hecha desde el lead (queda en Llamadas y en el historial). */
    public function postActionLogCall(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $scope = $this->scopeOf($d->entityType ?? null);
        $lead = $this->em->getEntityById($scope, (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        $results = ['Contactado', 'No contesta', 'Buzón de voz', 'Número equivocado', 'Reagendar'];
        $result = in_array($d->result ?? '', $results, true) ? $d->result : 'Contactado';
        $minutes = max(0, min(600, (int) ($d->minutes ?? 0)));
        $note = trim((string) ($d->note ?? ''));
        $name = $lead->get('name') ?: 'lead';
        $this->em->createEntity('Call', [
            'name' => "Llamada a {$name} — {$result}", 'status' => 'Held', 'direction' => 'Outbound',
            'dateStart' => gmdate('Y-m-d H:i:s', time() - $minutes * 60), 'duration' => $minutes * 60,
            'parentType' => $scope, 'parentId' => $lead->getId(), 'assignedUserId' => $this->user->getId(),
            'description' => $note,
        ]);
        $this->em->createEntity('Note', [
            'type' => 'Post', 'parentType' => $scope, 'parentId' => $lead->getId(),
            'post' => "[Llamada] {$result}" . ($minutes ? " ({$minutes} min)" : '') . ($note !== '' ? ": {$note}" : '') ,
        ]);
        return (object) ['ok' => true];
    }

    // ---------- Historial del lead (chat, llamadas, correos, estados) ----------
    private const RECORD_SCOPES = ['Lead', 'Account', 'Contact', 'Opportunity'];

    private function scopeOf(?string $s): string
    {
        return in_array($s, self::RECORD_SCOPES, true) ? $s : 'Lead';
    }

    private function leadFor(Request $request): \Espo\ORM\Entity
    {
        $lead = $this->em->getEntityById($this->scopeOf($request->getQueryParam('scope')), (string) $request->getQueryParam('leadId'));
        if (!$lead || !$this->acl->checkEntityRead($lead)) {
            throw new Forbidden();
        }
        return $lead;
    }

    public function getActionLeadTimeline(Request $request): \stdClass
    {
        $lead = $this->leadFor($request);
        $t = new \Espo\Custom\Services\LeadTimeline($this->em);
        $kind = (string) $request->getQueryParam('kind');
        $scope = $lead->getEntityType();
        $items = match ($kind) {
            'calls' => $t->calls($lead->getId(), $scope),
            'emails' => $t->emails($lead->getId(), $scope),
            'status' => $scope === 'Lead' ? $t->statusLog($lead->getId()) : [],
            default => $scope === 'Lead' ? $t->chat($lead->getId(), (string) $request->getQueryParam('channel')) : [],
        };
        return (object) ['items' => $items];
    }

    /** ¿Ya hubo una acción con el lead desde el último cambio de estado? Si no, el cambio exige comentario. */
    public function getActionStatusGuard(Request $request): \stdClass
    {
        $lead = $this->leadFor($request);
        $a = (new \Espo\Custom\Services\LeadTimeline($this->em))->priorAction($lead);
        return (object) ['requiresComment' => !$a, 'action' => $a];
    }

    // ---------- Correo «como el usuario» (nombre, firma y respuestas personales) ----------
    private function signatureHtml(): string
    {
        $prefs = $this->em->getEntityById('Preferences', $this->user->getId());
        $custom = $prefs ? trim((string) $prefs->get('signature')) : '';
        if ($custom !== '') {
            return '<div data-ch-sig="1">' . $custom . '</div>';
        }
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        $name = $this->user->get('name') ?: $this->user->get('userName');
        $lines = [];
        $title = trim((string) $this->user->get('title'));
        $company = (string) $this->config->get('applicationName');
        if ($title !== '' || $company !== '') {
            $lines[] = '<span style="color:#5d6678">' . $e(trim($title . ($title !== '' && $company !== '' ? ' · ' : '') . $company)) . '</span>';
        }
        if ($this->user->get('phoneNumber')) {
            $lines[] = '<span style="color:#5d6678">Tel. ' . $e($this->user->get('phoneNumber')) . '</span>';
        }
        return '<div data-ch-sig="1" style="margin-top:18px;padding-top:12px;border-top:2px solid #4f63e8;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#161b2e">'
            . '<b style="font-size:14px">' . $e($name) . '</b>' . ($lines ? '<br>' . implode('<br>', $lines) : '') . '</div>';
    }

    public function getActionEmailSignature(Request $request): \stdClass
    {
        return (object) ['html' => $this->signatureHtml(), 'name' => $this->user->get('name'), 'custom' => (bool) trim((string) ($this->em->getEntityById('Preferences', $this->user->getId())?->get('signature') ?? ''))];
    }

    /** Envía desde el Hub con el nombre y la firma del usuario; si la empresa no tiene el correo del Centro responde fallback para usar el envío de Espo. */
    public function postActionEmailSend(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        if ($this->user->isApi() || !$this->acl->checkScope('Email', 'create')) {
            throw new Forbidden();
        }
        $text = trim((string) ($d->body ?? ''));
        $to = is_array($d->to ?? null) ? $d->to : preg_split('/[;,]\s*/', (string) ($d->to ?? ''), -1, PREG_SPLIT_NO_EMPTY);
        $cc = is_array($d->cc ?? null) ? $d->cc : preg_split('/[;,]\s*/', (string) ($d->cc ?? ''), -1, PREG_SPLIT_NO_EMPTY);
        if (!$to || $text === '') {
            throw new BadRequest('Escribe el destinatario y el mensaje.');
        }
        $parentType = in_array($d->parentType ?? '', ['Lead', 'Account', 'Contact', 'Opportunity'], true) ? $d->parentType : null;
        $parentId = null;
        if ($parentType && !empty($d->parentId)) {
            $parent = $this->em->getEntityById($parentType, (string) $d->parentId);
            if (!$parent || !$this->acl->checkEntityRead($parent)) {
                throw new Forbidden();
            }
            $parentId = $parent->getId();
        }
        $html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#161b2e">'
            . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>' . $this->signatureHtml();
        $payload = ['userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')), 'to' => array_values($to), 'cc' => array_values($cc),
            'subject' => mb_substr(trim((string) ($d->subject ?? '')), 0, 250), 'html' => $html, 'parentType' => $parentType, 'parentId' => $parentId,
            'inReplyTo' => !empty($d->inReplyTo) ? (string) $d->inReplyTo : null, 'references' => array_values(array_filter((array) ($d->references ?? []), 'is_string'))];
        try {
            $r = (new HubClient($this->config))->request('POST', '/v1/email/send', $payload, 45);
        } catch (\RuntimeException $e) {
            $msg = $e->getMessage();
            if (str_contains($msg, 'HTTP 409')) {
                return (object) ['fallback' => true];
            }
            preg_match('/"detail":"([^"]+)"/u', $msg, $m);
            throw new BadRequest($m[1] ?? 'No se pudo enviar el correo.');
        }
        return (object) ['ok' => true, 'id' => $r['id'] ?? null, 'replyTo' => $r['replyTo'] ?? null];
    }


    /** Roles del usuario actual: el manual muestra solo lo que le corresponde. */
    public function getActionMyroles(Request $request): \stdClass
    {
        $names = [];
        foreach ($this->user->getLinkMultipleIdList('roles') as $rid) {
            if ($r = $this->em->getEntityById('Role', $rid)) {
                $names[] = $r->get('name');
            }
        }
        return (object) ['isAdmin' => $this->user->isAdmin(), 'roles' => $names];
    }

    // ---------- Web Push (notificaciones con la app cerrada) ----------
    private function hubAny(string $method, string $path, ?array $body = null): array
    {
        try {
            return (new HubClient($this->config))->request($method, $path, $body, 20);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'El servicio de notificaciones no está disponible.');
        }
    }

    public function getActionPushKey(Request $request): \stdClass
    {
        return (object) $this->hubAny('GET', '/v1/push/key');
    }

    public function postActionPushSubscribe(Request $request): \stdClass
    {
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        return (object) $this->hubAny('POST', '/v1/push/subscribe', [
            'userId' => $this->user->getId(), 'subscription' => $d['subscription'] ?? [], 'userAgent' => (string) ($d['userAgent'] ?? ''),
        ]);
    }

    public function postActionPushUnsubscribe(Request $request): \stdClass
    {
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        return (object) $this->hubAny('POST', '/v1/push/unsubscribe', ['endpoint' => (string) ($d['endpoint'] ?? '')]);
    }

    /** Envía una notificación de prueba a los dispositivos del propio usuario. */
    public function postActionPushTest(Request $request): \stdClass
    {
        return (object) $this->hubAny('POST', '/v1/push/send', [
            'userId' => $this->user->getId(), 'title' => 'Crm Hub 360', 'body' => 'Notificación de prueba: tu dispositivo recibirá avisos aunque la app esté cerrada.', 'url' => '/',
        ]);
    }

    // ---------- Telegram ----------
    public function postActionTelegramSetup(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/telegram/setup', []);
    }

    public function postActionTelegramTest(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/telegram/test', []);
    }

    public function postActionTelegramSend(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubAny('POST', '/v1/telegram/send', [
            'leadId' => $lead->getId(), 'text' => (string) ($d->text ?? ''), 'agent' => $this->user->get('name') ?: $this->user->get('userName'),
        ]);
    }

    /** Enlace t.me de un solo uso para que el cliente abra el chat con el bot y quede ligado a este lead. */
    public function postActionTelegramInvite(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubAny('POST', '/v1/telegram/invite', ['leadId' => $lead->getId()]);
    }

    // ---------- SMS y llamadas ----------
    public function postActionTwilioTest(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/twilio/test', []);
    }

    public function postActionSmsSend(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubAny('POST', '/v1/sms/send', ['leadId' => $lead->getId(), 'text' => (string) ($d->text ?? ''),
            'agent' => $this->user->get('name') ?: $this->user->get('userName')]);
    }

    public function postActionSmsTest(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubAny('POST', '/v1/sms/test', ['to' => (string) ($d->to ?? '')]);
    }

    /** Click-to-call: la central/proveedor llama primero al teléfono o extensión del asesor y luego lo conecta con el cliente. */
    public function postActionVoiceCall(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubAny('POST', '/v1/voice/call', ['leadId' => $lead->getId(), 'agentPhone' => (string) ($d->agentPhone ?? ''),
            'agent' => $this->user->get('name') ?: $this->user->get('userName'), 'agentId' => $this->user->getId()]);
    }

    /** Qué canales están listos (el botón de llamar decide entre click-to-call y el marcador del equipo). */
    public function getActionChannels(Request $request): \stdClass
    {
        $s = $this->hubAny('GET', '/v1/tenant/settings');
        return (object) ['whatsapp' => !empty($s['wa']['provider']), 'sms' => !empty($s['sms']['provider']), 'voice' => !empty($s['voice']['provider']),
                         'telegram' => !empty($s['telegram']['tokenSet']), 'email' => !empty($this->config->get('outboundEmailFromAddress')), 'emailFrom' => (string) $this->config->get('outboundEmailFromAddress'),
                         'admin' => $this->user->isAdmin()];
    }

    // ---------- Campañas de mensajes masivos ----------
    private function broadcastGuard(): void
    {
        if ($this->assignmentLevel() === 'no') {
            throw new Forbidden('No tienes permiso para enviar mensajes masivos.');
        }
    }

    /** Leads que cumplen los filtros, dentro de lo que el usuario puede ver, con un medio de contacto válido para el canal. */
    private function audience(array $f, string $channel): array
    {
        $b = $this->selectBuilderFactory->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder();
        $where = [['OR' => [['doNotContact' => false], ['doNotContact' => null]]]];
        foreach (['status' => 'statuses', 'qualificationStatus' => 'qualifications', 'source' => 'sources', 'preferredChannel' => 'channels'] as $field => $key) {
            if (!empty($f[$key]) && is_array($f[$key])) {
                $where[] = [$field => array_values($f[$key])];
            }
        }
        if (!empty($f['campaignId'])) {
            $where[] = ['campaignId' => (string) $f['campaignId']];
        }
        if (($f['assigned'] ?? '') === 'none') {
            $where[] = ['assignedUserId' => null];
        } elseif (!empty($f['assigned'])) {
            $where[] = ['assignedUserId' => (string) $f['assigned']];
        }
        if (!empty($f['days'])) {
            $where[] = ['createdAt>=' => gmdate('Y-m-d H:i:s', time() - (int) $f['days'] * 86400)];
        }
        if (!empty($f['service'])) {
            $where[] = ['suggestedService*' => '%' . str_replace(['%', '_'], '', (string) $f['service']) . '%'];
        }
        $b->select(['id', 'name', 'phoneNumber', 'telegramChatId'])->where($where)->limit(0, 20000);
        $ids = [];
        $sample = [];
        foreach ($this->em->getRDBRepository('Lead')->clone($b->build())->find() as $l) {
            $ok = $channel === 'telegram' ? (bool) $l->get('telegramChatId') : (bool) $l->get('phoneNumber');
            if ($ok) {
                $ids[] = $l->getId();
                if (count($sample) < 8) {
                    $sample[] = $l->get('name');
                }
            }
        }
        return ['ids' => $ids, 'sample' => $sample];
    }

    public function postActionBroadcastAudience(Request $request): \stdClass
    {
        $this->broadcastGuard();
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $channel = in_array($d['channel'] ?? '', ['whatsapp', 'sms', 'telegram'], true) ? $d['channel'] : 'whatsapp';
        $a = $this->audience((array) ($d['filters'] ?? []), $channel);
        return (object) ['count' => count($a['ids']), 'sample' => $a['sample']];
    }

    public function postActionBroadcastCreate(Request $request): \stdClass
    {
        $this->broadcastGuard();
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $channel = in_array($d['channel'] ?? '', ['whatsapp', 'sms', 'telegram'], true) ? $d['channel'] : '';
        $a = $this->audience((array) ($d['filters'] ?? []), $channel ?: 'whatsapp');
        return (object) $this->hubAny('POST', '/v1/broadcasts', [
            'name' => (string) ($d['name'] ?? ''), 'channel' => $channel, 'text' => (string) ($d['text'] ?? ''), 'leadIds' => $a['ids'],
            'perMinute' => (int) ($d['perMinute'] ?? 20), 'footer' => (bool) ($d['footer'] ?? true), 'startInMinutes' => (int) ($d['startInMinutes'] ?? 0),
            'by' => $this->user->get('name') ?: $this->user->get('userName'),
        ]);
    }

    public function getActionBroadcasts(Request $request): \stdClass
    {
        $this->broadcastGuard();
        return (object) $this->hubAny('GET', '/v1/broadcasts');
    }

    public function getActionBroadcast(Request $request): \stdClass
    {
        $this->broadcastGuard();
        return (object) $this->hubAny('GET', '/v1/broadcasts/' . (int) $request->getRouteParam('id'));
    }

    public function postActionBroadcastAction(Request $request): \stdClass
    {
        $this->broadcastGuard();
        $act = (string) $request->getRouteParam('act');
        if (!in_array($act, ['pause', 'resume', 'cancel'], true)) {
            throw new BadRequest();
        }
        return (object) $this->hubAny('POST', '/v1/broadcasts/' . (int) $request->getRouteParam('id') . '/' . $act, []);
    }
}
