<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Acl;
use Espo\Core\Api\Request;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Select\SelectBuilderFactory;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Config\ConfigWriter;
use Espo\Core\Utils\Language;
use Espo\Core\Utils\Metadata;
use Espo\Custom\Services\HubClient;
use Espo\Custom\Services\LeadAssigner;
use Espo\Entities\User;
use Espo\ORM\EntityManager;

/**
 * Controlador de la API CrmHub/* del CRM: integraciones, asignación y reasignación, panel gerencial,
 * canales de mensajería, campañas, copias de leads, simulador, plantillas, procesos, lectura de documentos y comercial virtual.
 * Casi todo se delega al Hub (HubClient). Las rutas están en Resources/routes.json; el permiso se valida en cada acción.
 */
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
        private ConfigWriter $configWriter,
        private Language $language
    ) {}

    /** Exige administrador; si no, 403. */
    private function admin(): void
    {
        if (!$this->user->isAdmin()) {
            throw new Forbidden();
        }
    }

    /** Cliente del Hub; solo administradores. */
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
    /** GET /CrmHub/integrations. Admin. Hub: GET /v1/tenant/settings. */
    public function getActionIntegrations(Request $request): \stdClass
    {
        return (object) $this->hub()->request('GET', '/v1/tenant/settings');
    }

    /** PUT /CrmHub/integrations. Admin. Hub: PUT /v1/tenant/settings (solo claves permitidas). */
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

    /** POST /CrmHub/integrations/reset-services. Admin. Hub: POST /v1/tenant/settings/reset-services. */
    public function postActionResetServices(Request $request): \stdClass
    {
        return (object) $this->hub()->request('POST', '/v1/tenant/settings/reset-services', []);
    }

    // ---------- Asignación automática (solo administradores) ----------
    /** GET /CrmHub/assignment. Admin. Configuración de asignación automática. */
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

    /** PUT /CrmHub/assignment. Admin. Guarda la configuración de asignación automática. */
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

    /** Solo el usuario API del Hub: avisa en la campana del CRM (p. ej. «Nuevo registro» de un formulario web). */
    public function postActionNotifyTeam(Request $request): \stdClass
    {
        if (!$this->user->isApi()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        $message = trim((string) ($d->message ?? ''));
        $ids = is_array($d->userIds ?? null) ? array_slice(array_unique(array_filter($d->userIds, 'is_string')), 0, 50) : [];
        if ($message === '' || !$ids) {
            throw new BadRequest('Faltan el mensaje o los usuarios.');
        }
        $n = 0;
        foreach ($ids as $uid) {
            $user = $this->em->getEntityById('User', $uid);
            if (!$user || !$user->get('isActive')) {
                continue;
            }
            $note = $this->em->getNewEntity('Notification');
            $note->set(['type' => 'Message', 'userId' => $uid, 'message' => mb_substr($message, 0, 500)]);
            $this->em->saveEntity($note);
            $n++;
        }
        return (object) ['sent' => $n];
    }

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
            'idTemp' => $this->config->get('crmhubIdTemp') ?: 'phone',
            'idRequired' => $this->config->get('crmhubIdRequired') !== false,
        ];
    }

    /** PUT /CrmHub/pipeline. Admin. Guarda los estados del pipeline. */
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
        $idTemp = in_array((string) ($d->idTemp ?? 'phone'), ['phone', 'email', 'off'], true) ? (string) $d->idTemp : 'phone';
        $this->configWriter->setMultiple(['crmhubStatusNew' => $new, 'crmhubStatusReview' => $review,
                                          'crmhubStatusQualified' => $qualified, 'crmhubClosedStatuses' => $closed,
                                          'crmhubIdTemp' => $idTemp, 'crmhubIdRequired' => !isset($d->idRequired) || (bool) $d->idRequired]);
        $this->configWriter->save();
        return (object) ['ok' => true];
    }

    // ---------- Reasignación (admin, directores y gerentes según su permiso de asignación) ----------
    /** GET /CrmHub/assignees. Usuarios con permiso de asignación. Lista a quién se puede reasignar. */
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

    /** POST /CrmHub/reassign. Usuarios con permiso de asignación y edición del registro. */
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

    /** GET /CrmHub/metrics. Usuario; datos según su ACL. Hub: GET /v1/agent/attended (comercial virtual). */
    public function getActionMetrics(Request $request): \stdClass
    {
        $days = (int) ($request->getQueryParam('days') ?: 30);
        return $this->computeMetrics(in_array($days, [7, 30, 90, 365], true) ? $days : 30, null, $ids);
    }

    /** GET /CrmHub/metricsLeads?days=&seg=. Ids de los leads que suman en una cifra del tablero (con las mismas reglas), para abrirlos en una lista. seg: leads, sinAsesor, conVirtual, califican, cierres, deuda, mora, estado:<estado>, servicio:<nombre>, origen:<nombre>, campana:<nombre>, asesor:<nombre>, dia:<AAAA-MM-DD>. */
    public function getActionMetricsLeads(Request $request): \stdClass
    {
        $days = (int) ($request->getQueryParam('days') ?: 30);
        $ids = [];
        $this->computeMetrics(in_array($days, [7, 30, 90, 365], true) ? $days : 30, (string) $request->getQueryParam('seg'), $ids);
        return (object) ['ids' => array_slice($ids, 0, 2000)];
    }

    /** Cálculo del tablero; con $seg además junta los ids de ese segmento en $ids. */
    private function computeMetrics(int $days, ?string $seg, ?array &$ids): \stdClass
    {
        $ids = [];
        $push = function (string $key, $l) use ($seg, &$ids) {
            if ($seg !== null && $seg === $key) {
                $ids[] = $l->getId();
            }
        };
        $now = time();
        $from = gmdate('Y-m-d H:i:s', $now - $days * 86400);
        $today = gmdate('Y-m-d 00:00:00');

        $builder = $this->selectBuilderFactory->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder();
        $builder->select(['id', 'status', 'source', 'assignedUserId', 'createdAt', 'totalDebt', 'overdueDebt',
                          'qualificationStatus', 'suggestedService', 'campaignId', 'isSimulation', 'isThread'])->limit(0, 30000);
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
        $k = ['leads' => 0, 'nuevosHoy' => 0, 'sinAsesor' => 0, 'conVirtual' => 0, 'evaluados' => 0, 'califican' => 0, 'cierres' => 0,
              'deudaTotal' => 0, 'deudaMora' => 0, 'abiertos' => 0];
        $estado = array_fill_keys($stages, 0);
        $servicio = $origen = $campana = $asesor = [];
        $bucket = max(1, (int) ceil($days / 30));
        $trend = [];
        for ($i = (int) ceil($days / $bucket) - 1; $i >= 0; $i--) {
            $trend[gmdate('Y-m-d', $now - $i * $bucket * 86400)] = 0;
        }
        $trendKeys = array_keys($trend);
        // leads que hoy gestiona un comercial virtual: sin asesor humano, pero no «sin atender»
        $virtual = [];
        try {
            $virtual = (array) (($this->hubCall('GET', '/v1/agent/attended', null, 5)['leads'] ?? []));
        } catch (\Throwable $e) {
        }

        foreach ($leads as $l) {
            if ($l->get('isSimulation') || $l->get('isThread')) {
                continue;   // los leads de la simulación no cuentan en los reportes reales
            }
            $status = (string) $l->get('status');
            $closed = in_array($status, $closedList, true);
            if (!$closed) {
                $k['abiertos']++;
            }
            $k['deudaTotal'] += (float) $l->get('totalDebt');
            $k['deudaMora'] += (float) $l->get('overdueDebt');
            if ((float) $l->get('totalDebt') > 0) {
                $push('deuda', $l);
            }
            if ((float) $l->get('overdueDebt') > 0) {
                $push('mora', $l);
            }
            if (isset($estado[$status])) {
                $estado[$status]++;
                $push('estado:' . $status, $l);
            }
            $created = (string) $l->get('createdAt');
            if ($created >= $today) {
                $k['nuevosHoy']++;
            }
            if ($created < $from) {
                continue; // el resto son métricas de los leads captados en el periodo
            }
            $k['leads']++;
            $push('leads', $l);
            $uid = $l->get('assignedUserId');
            $va = !$uid ? ($virtual[$l->getId()] ?? null) : null;
            if (!$uid && $va) {
                $k['conVirtual']++;
                $push('conVirtual', $l);
            } elseif (!$uid) {
                $k['sinAsesor']++;
                $push('sinAsesor', $l);
            }
            $q = (string) $l->get('qualificationStatus');
            if ($q !== '') {
                $k['evaluados']++;
                if ($q === 'Califica') {
                    $k['califican']++;
                    $push('califican', $l);
                    $svc = trim(explode(' (', (string) $l->get('suggestedService'))[0]);
                    $servicio[$svc ?: 'Sin servicio'] = ($servicio[$svc ?: 'Sin servicio'] ?? 0) + 1;
                    $push('servicio:' . ($svc ?: 'Sin servicio'), $l);
                }
            }
            $won = $status === ($closedList[0] ?? 'Cierre Exitoso');
            $k['cierres'] += $won ? 1 : 0;
            if ($won) {
                $push('cierres', $l);
            }
            $src = (string) ($l->get('source') ?: 'Sin origen');
            $origen[$src] = ($origen[$src] ?? 0) + 1;
            $push('origen:' . $src, $l);
            if ($cid = $l->get('campaignId')) {
                $cn = $camps[$cid] ?? 'Campaña';
                $campana[$cn] = ($campana[$cn] ?? 0) + 1;
                $push('campana:' . $cn, $l);
            }
            $an = $uid ? ($names[$uid] ?? $uid) : ($va ? 'Comercial virtual · ' . ($va['name'] ?? '') : 'Sin asesor');
            $asesor[$an] ??= ['name' => $an, 'leads' => 0, 'califican' => 0, 'cierres' => 0, 'virtual' => !$uid && $va];
            $push('asesor:' . $an, $l);
            $asesor[$an]['leads']++;
            $asesor[$an]['califican'] += $q === 'Califica' ? 1 : 0;
            $asesor[$an]['cierres'] += $won ? 1 : 0;
            $day = substr($created, 0, 10);
            for ($i = count($trendKeys) - 1; $i >= 0; $i--) {
                if ($day >= $trendKeys[$i]) {
                    $trend[$trendKeys[$i]]++;
                    $push('dia:' . $trendKeys[$i], $l);
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

    /** POST /CrmHub/autoAssign. Quien tiene permiso de asignación. {ids}: reparte esos leads sin asesor con el mismo balanceo del reparto automático (por campaña o grupo general). */
    public function postActionAutoAssign(Request $request): \stdClass
    {
        if ($this->assignmentLevel() === 'no') {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        $assigner = new LeadAssigner($this->em, $this->config);
        $done = $skipped = 0;
        foreach (array_slice((array) ($d->ids ?? []), 0, 300) as $id) {
            $lead = $this->em->getEntityById('Lead', (string) $id);
            if (!$lead || $lead->get('assignedUserId') || !$this->acl->checkEntityEdit($lead)) {
                $skipped++;
                continue;
            }
            $u = $assigner->pick($lead->get('campaignId'));
            if ($u) {
                $assigner->assign($lead, $u);
                $done++;
            } else {
                $skipped++;
            }
        }
        return (object) ['assigned' => $done, 'skipped' => $skipped];
    }

    // ---------- Organigrama: gerentes -> equipos (directores y asesores), derivado de roles y equipos ----------
    /** GET /CrmHub/orgchart. Usuarios con permiso de asignación. Organigrama por roles y equipos. */
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

    // ---------- Proveedores (líneas) de mensajería ----------
    /** Id de línea (lineId) del cuerpo de la petición, o null. */
    private function lineIdOf(Request $request): ?string
    {
        $b = $request->getParsedBody();
        return is_object($b) && !empty($b->lineId) && is_string($b->lineId) ? $b->lineId : null;
    }

    /** Llama al Hub (admin) y convierte el error en BadRequest con mensaje de respaldo. */
    private function lineCall(string $method, string $path, ?array $body = null, string $fallback = 'No se pudo completar la acción.'): array
    {
        try {
            return $this->hub()->request($method, $path, $body, 40);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? $fallback);
        }
    }

    /** Cuerpo JSON de la petición como arreglo. */
    private function bodyArray(Request $request): array
    {
        return json_decode(json_encode($request->getParsedBody()), true) ?: [];
    }

    /** GET /CrmHub/lines. Admin. Hub: GET /v1/lines. */
    public function getActionLines(Request $request): \stdClass
    {
        return (object) $this->lineCall('GET', '/v1/lines');
    }

    /** POST /CrmHub/lineSave. Admin. Hub: POST /v1/lines. */
    public function postActionLineSave(Request $request): \stdClass
    {
        return (object) $this->lineCall('POST', '/v1/lines', $this->bodyArray($request), 'No se pudo guardar el proveedor.');
    }

    /** POST /CrmHub/lineEnable. Admin. Hub: POST /v1/lines/enabled. */
    public function postActionLineEnable(Request $request): \stdClass
    {
        return (object) $this->lineCall('POST', '/v1/lines/enabled', ['id' => (string) ($request->getParsedBody()->id ?? ''), 'enabled' => !empty($request->getParsedBody()->enabled)]);
    }

    /** POST /CrmHub/lineDefault. Admin. Hub: POST /v1/lines/default. */
    public function postActionLineDefault(Request $request): \stdClass
    {
        return (object) $this->lineCall('POST', '/v1/lines/default', ['id' => (string) ($request->getParsedBody()->id ?? '')]);
    }

    /** POST /CrmHub/lineDelete. Admin. Hub: POST /v1/lines/delete. */
    public function postActionLineDelete(Request $request): \stdClass
    {
        return (object) $this->lineCall('POST', '/v1/lines/delete', ['id' => (string) ($request->getParsedBody()->id ?? '')]);
    }

    /** POST /CrmHub/lineTest. Admin. Hub: POST /v1/lines/test. */
    public function postActionLineTest(Request $request): \stdClass
    {
        return (object) $this->lineCall('POST', '/v1/lines/test', ['id' => (string) ($request->getParsedBody()->id ?? '')], 'No se pudo probar la conexión.');
    }

    /** POST /CrmHub/lineSendTest. Admin. Hub: POST /v1/lines/send-test. */
    public function postActionLineSendTest(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        return (object) $this->lineCall('POST', '/v1/lines/send-test', ['id' => (string) ($d->id ?? ''), 'to' => (string) ($d->to ?? ''), 'text' => (string) ($d->text ?? '')], 'No se pudo enviar la prueba.');
    }

    /** Líneas encendidas por canal: para elegir «enviar desde» (cualquier usuario del CRM). */
    public function getActionLinesActive(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubAny('GET', '/v1/lines/active');
    }

    // ---------- WhatsApp (envío) y llamadas ----------
    /** POST /CrmHub/whatsapp/unlink. Admin. Hub: POST /v1/whatsapp/unlink. */
    public function postActionWhatsappUnlink(Request $request): \stdClass
    {
        try {
            return (object) $this->hub()->request('POST', '/v1/whatsapp/unlink', ['lineId' => $this->lineIdOf($request)]);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo desvincular el número.');
        }
    }

    /** POST /CrmHub/whatsapp/qr. Admin. Hub: POST /v1/whatsapp/qr. */
    public function postActionWhatsappQr(Request $request): \stdClass
    {
        try {
            return (object) $this->hub()->request('POST', '/v1/whatsapp/qr', ['lineId' => $this->lineIdOf($request)]);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo obtener el código QR.');
        }
    }

    /** POST /CrmHub/whatsapp/test. Admin. Hub: POST /v1/whatsapp/test. */
    public function postActionWhatsappTest(Request $request): \stdClass
    {
        try {
            return (object) $this->hub()->request('POST', '/v1/whatsapp/test', ['lineId' => $this->lineIdOf($request)]);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo probar la conexión.');
        }
    }

    /** POST /CrmHub/meet/create. Usuario con edición del lead. Hub: POST /v1/meet/rooms. Devuelve el enlace del cliente y el del anfitrión. */
    public function postActionMeetCreate(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        $me = $this->user->get('name') ?: $this->user->get('userName');
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/meet/rooms', [
                'leadId' => $lead->getId(), 'title' => 'Videollamada con ' . ($lead->get('name') ?: 'cliente'), 'hostName' => (string) $me, 'createdBy' => $this->user->getId(),
                'hostLang' => 'es', 'guestLang' => 'en', 'subtitles' => true, 'guestName' => (string) ($lead->get('name') ?: ''),
            ], 20);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo crear la videollamada.');
        }
    }

    /** GET /CrmHub/meet/waiting[?leadId=]. Clientes que esperan en la sala de espera de las videollamadas, con el enlace para entrar a admitirlos.
     *  Con leadId: las del lead (usuario con acceso a él). Sin leadId: las del usuario actual (las salas que creó o de leads que tiene asignados), para avisarle en cualquier pantalla. Hub: GET /v1/meet/rooms y /v1/meet/waiting. */
    public function getActionMeetWaiting(Request $request): \stdClass
    {
        $leadId = (string) $request->getQueryParam('leadId');
        $out = [];
        if (!in_array((string) $this->config->get('crmhubMeet'), ['video', 'video_subs'], true)) {
            return (object) ['waiting' => [], 'upcoming' => []];   // servicio no habilitado: el aviso global no consulta al Hub
        }
        try {
            $hub = new HubClient($this->config);
            if ($leadId !== '') {
                $lead = $this->em->getEntityById('Lead', $leadId);
                if (!$lead || !$this->acl->checkEntityRead($lead)) {
                    throw new Forbidden();
                }
                $r = $hub->request('GET', '/v1/meet/rooms?leadId=' . rawurlencode($lead->getId()), null, 8);
                $rooms = [];
                foreach ((array) ($r['items'] ?? []) as $x) {
                    if (empty($x['active'])) {
                        continue;
                    }
                    $live = (array) ($x['live'] ?? []);
                    if (!empty($x['waiting'])) {
                        $rooms[] = ['code' => $x['code'], 'names' => $x['waiting'], 'leadId' => $leadId, 'title' => $x['title'] ?? '', 'kind' => 'waiting'];
                    } elseif (!empty($live['guests']) && empty($live['hosts'])) {
                        $rooms[] = ['code' => $x['code'], 'names' => $live['guests'], 'leadId' => $leadId, 'title' => $x['title'] ?? '', 'kind' => 'live'];
                    }
                }
            } else {
                $r = $hub->request('GET', '/v1/meet/waiting', null, 8);
                $rooms = [];
                foreach ((array) ($r['items'] ?? []) as $x) {
                    $mine = ($x['createdBy'] ?? '') === $this->user->getId();
                    if (!$mine && !empty($x['leadId'])) {
                        $l = $this->em->getEntityById('Lead', (string) $x['leadId']);
                        $mine = $l && $l->get('assignedUserId') === $this->user->getId();
                    }
                    if ($mine) {
                        $rooms[] = $x;
                    }
                }
            }
            foreach ($rooms as $room) {
                $h = $hub->request('GET', '/v1/meet/rooms/' . preg_replace('/[^a-z0-9-]/', '', (string) $room['code']) . '/host', null, 8);
                $out[] = ['code' => $room['code'], 'names' => array_values((array) $room['names']), 'leadId' => $room['leadId'] ?? '', 'title' => $room['title'] ?? '', 'kind' => $room['kind'] ?? 'waiting', 'hostUrl' => $h['hostUrl'] ?? null];
            }
        } catch (\RuntimeException $e) {
            // sin datos: no hay aviso
        }
        return (object) ['waiting' => $out, 'upcoming' => $leadId === '' ? $this->upcomingMeets() : []];
    }

    /** Enlace de entrada del anfitrión de la sala de una reunión; si la sala ya no existe en el Hub la reabre con el mismo código (el enlace del cliente sigue valiendo). */
    private function meetingHostUrl(HubClient $hub, $m): ?string
    {
        $code = preg_replace('/[^a-z0-9-]/', '', (string) $m->get('videoCode'));
        try {
            return $hub->request('GET', '/v1/meet/rooms/' . $code . '/host', null, 8)['hostUrl'] ?? null;
        } catch (\RuntimeException $e) {
            $end = $m->get('dateEnd') ? strtotime($m->get('dateEnd') . ' UTC') : time() + 3600;
            $parentLead = $m->get('parentType') === 'Lead' ? (string) $m->get('parentId') : '';
            $r = $hub->request('POST', '/v1/meet/rooms/restore', [
                'code' => $code, 'title' => (string) $m->get('name'), 'leadId' => $parentLead, 'hostName' => (string) ($this->user->get('name') ?: $this->user->get('userName')),
                'guestName' => (string) $m->get('parentName'), 'validHours' => (int) max(24, min(24 * 90, ceil(($end - time()) / 3600) + 12)), 'createdBy' => $this->user->getId(),
            ], 15);
            return $r['hostUrl'] ?? null;
        }
    }

    /** Videollamadas programadas del usuario que empiezan en los próximos 15 minutos (o empezaron hace menos de 20): el aviso global le recuerda entrar. */
    private function upcomingMeets(): array
    {
        $out = [];
        try {
            $hub = new HubClient($this->config);
            $list = $this->em->getRDBRepository('Meeting')->where([
                'assignedUserId' => $this->user->getId(), 'status' => 'Planned', 'videoCode!=' => '',
                'dateStart>=' => gmdate('Y-m-d H:i:s', time() - 1200), 'dateStart<=' => gmdate('Y-m-d H:i:s', time() + 900),
            ])->order('dateStart')->limit(0, 5)->find();
            foreach ($list as $m) {
                $out[] = ['id' => $m->getId(), 'name' => (string) $m->get('name'), 'minutes' => (int) round((strtotime($m->get('dateStart') . ' UTC') - time()) / 60), 'parentName' => (string) $m->get('parentName'), 'parentType' => (string) $m->get('parentType'), 'parentId' => (string) $m->get('parentId'), 'hostUrl' => $this->meetingHostUrl($hub, $m)];
            }
        } catch (\Throwable $e) {
            // sin recordatorio de videollamadas
        }
        return $out;
    }

    /** POST /CrmHub/meet/invite. Usuario con edición de la reunión. Envía (o reenvía) al cliente la invitación por correo con «Agregar al calendario». */
    public function postActionMeetInvite(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $m = $this->em->getEntityById('Meeting', (string) ($d->meetingId ?? ''));
        if (!$m || !$this->acl->checkEntityEdit($m)) {
            throw new Forbidden();
        }
        $svc = new \Espo\Custom\Services\MeetInvite($this->config, $this->em, $this->user);
        $kind = ($d->kind ?? '') === 'update' ? 'update' : 'invite';
        $channels = array_values(array_intersect((array) ($d->channels ?? ['email']), ['email', 'whatsapp', 'sms', 'telegram']));
        $keys = array_map('strval', (array) ($d->to ?? []));
        $results = [];
        foreach ($svc->recipients($m) as $r) {
            if ($keys && !in_array($r['key'], $keys, true)) {
                continue;
            }
            foreach ($channels as $c) {
                $results[] = ['name' => $r['name'], 'channel' => $c] + $svc->sendVia($m, $c, $kind, $r);
            }
        }
        return (object) ['ok' => true, 'results' => $results];
    }

    /** GET /CrmHub/meet/inviteInfo?meetingId=. Usuario con edición de la reunión. Destinatarios (registro de la reunión + leads y contactos invitados) con los canales disponibles de cada uno. */
    public function getActionMeetInviteInfo(Request $request): \stdClass
    {
        $m = $this->em->getEntityById('Meeting', (string) $request->getQueryParam('meetingId'));
        if (!$m || !$this->acl->checkEntityEdit($m)) {
            throw new Forbidden();
        }
        return (object) ['recipients' => (new \Espo\Custom\Services\MeetInvite($this->config, $this->em, $this->user))->recipients($m)];
    }

    /** POST /CrmHub/meet/inviteMail. Usuario con acceso al registro. {scope, recId, url, name?}: envía por correo, con la plantilla de invitación (botón para unirse y agregar al calendario + .ics), el enlace personal de una videollamada en curso a un lead, contacto o cuenta. Hub: POST /v1/meet/invite. */
    public function postActionMeetInviteMail(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $scope = (string) ($d->scope ?? '');
        $rec = in_array($scope, ['Lead', 'Contact', 'Account'], true) ? $this->em->getEntityById($scope, (string) ($d->recId ?? '')) : null;
        if (!$rec || !$this->acl->checkEntityRead($rec)) {
            throw new Forbidden();
        }
        $to = trim((string) $rec->get('emailAddress'));
        $url = (string) ($d->url ?? '');
        if (!$to) {
            throw new BadRequest('Esa persona no tiene correo en su ficha.');
        }
        if (!preg_match('#^https://[^\s]+$#', $url)) {
            throw new BadRequest();
        }
        $me = (string) ($this->user->get('name') ?: $this->user->get('userName'));
        $now = time();
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/meet/invite', [
                'to' => $to, 'toName' => (string) $rec->get('name'), 'title' => 'Videollamada con ' . $me, 'startUtc' => gmdate('Y-m-d H:i:s', $now), 'endUtc' => gmdate('Y-m-d H:i:s', $now + 3600),
                'url' => $url, 'organizerName' => $me, 'organizerEmail' => (string) $this->user->get('emailAddress'), 'userId' => $this->user->getId(),
                'tz' => (string) ($this->config->get('timeZone') ?: 'America/Bogota'), 'uid' => 'live-' . bin2hex(random_bytes(6)), 'parentType' => $scope, 'parentId' => $rec->getId(),
                'note' => 'La videollamada ya está en curso: entra cuando quieras y te daremos acceso en unos segundos.',
            ], 30);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'No se pudo enviar la invitación.');
        }
    }

    /** POST /CrmHub/meet/host. Usuario con acceso a la reunión. Hub: GET /v1/meet/rooms/{código}/host. Devuelve el enlace de entrada del anfitrión de la videollamada de una reunión. */
    public function postActionMeetHost(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $m = $this->em->getEntityById('Meeting', (string) ($d->meetingId ?? ''));
        if (!$m || !$this->acl->checkEntityRead($m) || !$m->get('videoCode')) {
            throw new Forbidden();
        }
        try {
            $u = $this->meetingHostUrl(new HubClient($this->config), $m);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo abrir la sala de esta videollamada.');
        }
        return (object) ['hostUrl' => $u];
    }

    /** GET /CrmHub/agenda?scope=&id=. Usuario con acceso al registro. Citas (reuniones y videollamadas), llamadas y tareas pendientes del registro, ordenadas: primero lo vencido y luego lo próximo. */
    public function getActionAgenda(Request $request): \stdClass
    {
        $scope = (string) $request->getQueryParam('scope');
        if (!in_array($scope, ['Lead', 'Account', 'Contact', 'Opportunity'], true)) {
            throw new BadRequest();
        }
        $rec = $this->em->getEntityById($scope, (string) $request->getQueryParam('id'));
        if (!$rec || !$this->acl->checkEntityRead($rec)) {
            throw new Forbidden();
        }
        $now = time();
        $base = ['parentType' => $scope, 'parentId' => $rec->getId()];
        $items = [];
        $add = function (string $type, $e, ?string $at, ?string $end) use (&$items, $now) {
            $ts = $at ? strtotime($at . ' UTC') : 0;
            $items[] = ['type' => $type, 'id' => $e->getId(), 'name' => (string) $e->get('name'), 'at' => $at, 'end' => $end, 'status' => (string) $e->get('status'),
                'overdue' => $ts && $ts < $now - 900, 'video' => $type === 'Meeting' && (bool) $e->get('videoCode'), 'ts' => $ts];
        };
        foreach ($this->em->getRDBRepository('Meeting')->where($base + ['status' => 'Planned', 'dateEnd>=' => gmdate('Y-m-d H:i:s', $now - 7 * 86400)])->order('dateStart')->limit(0, 20)->find() as $m) {
            $add('Meeting', $m, (string) $m->get('dateStart'), (string) $m->get('dateEnd'));
        }
        foreach ($this->em->getRDBRepository('Call')->where($base + ['status' => 'Planned', 'dateEnd>=' => gmdate('Y-m-d H:i:s', $now - 7 * 86400)])->order('dateStart')->limit(0, 20)->find() as $c) {
            $add('Call', $c, (string) $c->get('dateStart'), (string) $c->get('dateEnd'));
        }
        foreach ($this->em->getRDBRepository('Task')->where($base + ['status!=' => ['Completed', 'Canceled', 'Deferred']])->order('dateEnd')->limit(0, 20)->find() as $t) {
            $add('Task', $t, (string) ($t->get('dateEnd') ?: $t->get('dateEndDate') ?: ''), null);
        }
        usort($items, fn ($a, $b) => (($a['ts'] ?: PHP_INT_MAX) <=> ($b['ts'] ?: PHP_INT_MAX)));
        return (object) ['items' => array_slice($items, 0, 20), 'videoEnabled' => in_array((string) $this->config->get('crmhubMeet'), ['video', 'video_subs'], true)];
    }

    /** POST /CrmHub/meet/invitee. Usuario con acceso al registro. Hub: POST /v1/meet/rooms/{código}/invitee. Enlace de invitación nominal a una persona del CRM para una videollamada en curso. */
    public function postActionMeetInvitee(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $scope = (string) ($d->scope ?? 'Lead');
        if (!in_array($scope, ['Lead', 'Contact', 'Account', 'Opportunity'], true)) {
            throw new BadRequest();
        }
        $rec = $this->em->getEntityById($scope, (string) ($d->recId ?? ''));
        if (!$rec || !$this->acl->checkEntityRead($rec)) {
            throw new Forbidden();
        }
        $code = preg_replace('/[^a-z0-9-]/', '', (string) ($d->code ?? ''));
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/meet/rooms/' . $code . '/invitee', ['scope' => $scope, 'recId' => $rec->getId(), 'name' => (string) $rec->get('name')], 15);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo crear la invitación.');
        }
    }

    /** GET /CrmHub/meet/summary?code=&since=. Resumen de la reunión de una sala (generado al terminar la llamada), posterior a `since` (ms). Hub: GET /v1/meet/rooms/{código}/summary. */
    public function getActionMeetSummary(Request $request): \stdClass
    {
        $code = preg_replace('/[^a-z0-9-]/', '', (string) $request->getQueryParam('code'));
        $since = (int) $request->getQueryParam('since');
        try {
            $r = (new HubClient($this->config))->request('GET', '/v1/meet/rooms/' . $code . '/summary?since=' . $since, null, 10);
        } catch (\RuntimeException $e) {
            return (object) ['ready' => false];
        }
        if (!$r) {
            return (object) ['ready' => false];
        }
        if (!empty($r['leadId'])) {
            $lead = $this->em->getEntityById('Lead', (string) $r['leadId']);
            if (!$lead || !$this->acl->checkEntityRead($lead)) {
                throw new Forbidden();
            }
        }
        return (object) ['ready' => true, 'summary' => $r];
    }

    /** POST /CrmHub/meet/end. Usuario con edición del lead. Hub: POST /v1/meet/rooms/{código}/end. Cierra la sala de videollamada del lead. */
    public function postActionMeetEnd(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        $code = preg_replace('/[^a-z0-9-]/', '', (string) ($d->code ?? ''));
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/meet/rooms/' . $code . '/end', [], 20);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo cerrar la sala.');
        }
    }

    /** POST /CrmHub/whatsapp/send. Usuario con edición del lead. Envía por el Hub. */
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
                'agent' => $this->user->get('name') ?: $this->user->get('userName'), 'userId' => $this->user->getId(), 'phone' => !empty($d->phone) ? (string) $d->phone : null, 'lineId' => $this->lineIdOf($request),
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

    /** Normaliza el tipo de registro (por defecto Lead). */
    private function scopeOf(?string $s): string
    {
        return in_array($s, self::RECORD_SCOPES, true) ? $s : 'Lead';
    }

    /** Lead de la petición; 403 si el usuario no puede leerlo. */
    private function leadFor(Request $request): \Espo\ORM\Entity
    {
        $lead = $this->em->getEntityById($this->scopeOf($request->getQueryParam('scope')), (string) $request->getQueryParam('leadId'));
        if (!$lead || !$this->acl->checkEntityRead($lead)) {
            throw new Forbidden();
        }
        return $lead;
    }

    /**
     * GET /CrmHub/conversations?scope=mine|all&channel=whatsapp|sms|telegram. Cualquier usuario: la bandeja de Mensajes.
     * Conversaciones (por lead) de WhatsApp, SMS y Telegram de los leads que el usuario puede ver (control de acceso de Espo): con «mine» solo las de
     * sus leads o en las que escribió él; con «all» todas las visibles. Cada una trae el último mensaje y lo último de cada canal.
     */
    public function getActionConversations(Request $request): \stdClass
    {
        $scope = $request->getQueryParam('scope') === 'all' ? 'all' : 'mine';
        $only = in_array($request->getQueryParam('channel'), ['whatsapp', 'sms', 'telegram'], true) ? (string) $request->getQueryParam('channel') : '';
        $tags = ['whatsapp' => 'WhatsApp', 'sms' => 'SMS', 'telegram' => 'Telegram'];
        $or = [];
        foreach ($only ? [$tags[$only]] : array_values($tags) as $t) {
            $or[] = ['post*' => "[{$t}]%"];
            $or[] = ['post*' => "[Difusión:%] {$t}:%"];
        }
        $acl = $this->selectBuilderFactory->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder()->select(['id']);
        $where = ['type' => 'Post', 'parentType' => 'Lead', 'parentId=s' => $acl->build(), 'OR' => $or];
        $me = $this->user->getId();
        if ($scope === 'mine') {
            $name = (string) ($this->user->get('name') ?: $this->user->get('userName'));
            $wrote = [];
            foreach ($this->em->getRDBRepository('Note')->where(['type' => 'Post', 'parentType' => 'Lead', 'post*' => '[%] → ' . $name . ':%'])->order('createdAt', 'DESC')->limit(0, 400)->find() as $n) {
                $wrote[(string) $n->get('parentId')] = true;
            }
            $mine = $this->selectBuilderFactory->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder()->select(['id'])->where(['assignedUserId' => $me]);
            $where = ['type' => 'Post', 'parentType' => 'Lead', 'parentId=s' => $acl->build(), 'OR' => $or,
                'AND' => [['OR' => array_filter([['parentId=s' => $mine->build()], $wrote ? ['parentId' => array_keys($wrote)] : null])]]];
        }
        $t = new \Espo\Custom\Services\LeadTimeline($this->em);
        $byLead = [];
        foreach ($this->em->getRDBRepository('Note')->where($where)->order('createdAt', 'DESC')->limit(0, 2500)->find() as $n) {
            $m = $t->parseChat((string) $n->get('post'));
            if (!$m) {
                continue;
            }
            $id = (string) $n->get('parentId');
            if (!isset($byLead[$id]) && count($byLead) >= 120) {
                continue;
            }
            $msg = ['channel' => $m['channel'], 'dir' => $m['dir'], 'who' => $m['who'], 'text' => mb_substr((string) $m['text'], 0, 160), 'at' => (string) $n->get('createdAt')];
            $byLead[$id] ??= ['last' => $msg, 'channels' => []];
            $byLead[$id]['channels'][$m['channel']] ??= ['last' => $msg, 'count' => 0];
            $byLead[$id]['channels'][$m['channel']]['count']++;
        }
        $out = [];
        if ($byLead) {
            foreach ($this->em->getRDBRepository('Lead')->where(['id' => array_keys($byLead)])->find() as $l) {
                $c = $byLead[$l->getId()];
                $out[] = ['leadId' => $l->getId(), 'name' => (string) $l->get('name'), 'phone' => (string) $l->get('phoneNumber'), 'email' => (string) $l->get('emailAddress'),
                    'assignedUserId' => $l->get('assignedUserId'), 'assignedUserName' => (string) $l->get('assignedUserName'), 'status' => (string) $l->get('status'),
                    'last' => $c['last'], 'channels' => $c['channels']];
            }
            usort($out, fn ($a, $b) => strcmp($b['last']['at'], $a['last']['at']));
        }
        return (object) ['items' => array_slice($out, 0, 100), 'scope' => $scope, 'me' => $me];
    }

    /** GET /CrmHub/leadTimeline. Usuario con lectura del lead. Usa LeadTimeline (llamadas, correos, chat, estados). */
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
            'all' => $t->all($lead->getId(), $scope, $scope === 'Lead' ? $lead->getId() : $this->threadLeadId($lead)),
            default => $scope === 'Lead' ? $t->chat($lead->getId(), (string) $request->getQueryParam('channel')) : [],
        };
        $out = ['items' => $items];
        if ($kind === 'chat' && $scope === 'Lead') {   // números del cliente y a cuál se le escribe por defecto (el último desde el que respondió)
            $phones = [];
            foreach ((array) $this->em->getRepository('PhoneNumber')->getPhoneNumberData($lead) as $p) {
                $p = (array) $p;
                if (!empty($p['phoneNumber']) && empty($p['invalid'])) {
                    $phones[] = ['phone' => (string) $p['phoneNumber'], 'primary' => !empty($p['primary']), 'type' => (string) ($p['type'] ?? '')];
                }
            }
            $out['phones'] = $phones;
            try {
                $r = (new HubClient($this->config))->request('GET', '/v1/wa/route?leadId=' . rawurlencode($lead->getId()), null, 5);
                $out['preferred'] = $r['phone'] ?? null;
            } catch (\RuntimeException $e) {
                $out['preferred'] = null;
            }
        }
        return (object) $out;
    }

    /** ¿Ya hubo una acción con el lead desde el último cambio de estado? Si no, el cambio exige comentario. */
    public function getActionStatusGuard(Request $request): \stdClass
    {
        $lead = $this->leadFor($request);
        $a = (new \Espo\Custom\Services\LeadTimeline($this->em))->priorAction($lead);
        return (object) ['requiresComment' => !$a, 'action' => $a];
    }

    // ---------- Correo «como el usuario» (nombre, firma y respuestas personales) ----------
    /** Servicio de marca de correo. */
    private function brand(): \Espo\Custom\Services\EmailBrand
    {
        return new \Espo\Custom\Services\EmailBrand($this->em, $this->config);
    }

    /** Firma HTML del usuario. */
    private function signatureHtml(): string
    {
        return $this->brand()->signature($this->user);
    }

    /** Quita lo peligroso del HTML que viene del editor (scripts, manejadores on*, javascript:), conservando formato, colores y listas. */
    private function cleanHtml(string $h): string
    {
        $h = preg_replace('#<(script|style|iframe|object|embed|form|meta|link)\b[^>]*>.*?</\1>#is', '', $h) ?? '';
        $h = preg_replace('#<(script|style|iframe|object|embed|form|meta|link|input|button)\b[^>]*>#i', '', $h) ?? '';
        $h = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $h) ?? '';
        $h = preg_replace('#(href|src)\s*=\s*(["\'])\s*(javascript|data|vbscript):[^"\']*\2#i', '$1=$2#$2', $h) ?? '';
        return trim($h);
    }

    /** Diseño de marca de la empresa (cabecera con su logo o nombre, tarjeta con el mensaje, firma del usuario y pie). */
    private function brandedHtml(string $body, string $subject): string
    {
        return $this->brand()->wrap($body, $this->user);
    }

    /** GET /CrmHub/emailSignature. Usuario. Firma y nombre del usuario. */
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
        $body = !empty($d->isHtml) ? $this->cleanHtml($text) : nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8'));
        // una plantilla diseñada en el lienzo ya trae su cabecera y su estilo: no se envuelve de nuevo, solo se le añade la firma
        $html = str_contains($body, 'data-ch-design') ? '<!doctype html><html><body style="margin:0">' . $body . '<div style="max-width:600px;margin:0 auto;padding:6px 8px 18px">' . $this->signatureHtml() . '</div></body></html>'
            : $this->brandedHtml($body, mb_substr(trim((string) ($d->subject ?? '')), 0, 250));
        $payload = ['userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')), 'to' => array_values($to), 'cc' => array_values($cc),
            'subject' => mb_substr(trim((string) ($d->subject ?? '')), 0, 250), 'html' => $html, 'parentType' => $parentType, 'parentId' => $parentId,
            'inReplyTo' => !empty($d->inReplyTo) ? (string) $d->inReplyTo : null, 'references' => array_values(array_filter((array) ($d->references ?? []), 'is_string')), 'record' => false];
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
        // se guarda aquí, como el usuario: queda en «Enviados» (autor = él) y no en su bandeja de entrada
        $email = $this->em->createEntity('Email', (array) ($r['email'] ?? []));
        return (object) ['ok' => true, 'id' => $email->getId(), 'replyTo' => $r['replyTo'] ?? null];
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
    /** Llama al Hub sin exigir admin (20 s); error del Hub pasa a BadRequest. */
    private function hubAny(string $method, string $path, ?array $body = null): array
    {
        try {
            return (new HubClient($this->config))->request($method, $path, $body, 20);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest($m[1] ?? 'El servicio de notificaciones no está disponible.');
        }
    }

    /** GET /CrmHub/push/key. Usuario. Hub: GET /v1/push/key. */
    public function getActionPushKey(Request $request): \stdClass
    {
        return (object) $this->hubAny('GET', '/v1/push/key');
    }

    /** POST /CrmHub/push/subscribe. Usuario. Hub: POST /v1/push/subscribe. */
    public function postActionPushSubscribe(Request $request): \stdClass
    {
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        return (object) $this->hubAny('POST', '/v1/push/subscribe', [
            'userId' => $this->user->getId(), 'subscription' => $d['subscription'] ?? [], 'userAgent' => (string) ($d['userAgent'] ?? ''),
        ]);
    }

    /** POST /CrmHub/push/unsubscribe. Usuario. Hub: POST /v1/push/unsubscribe. */
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
    /** POST /CrmHub/telegram/setup. Admin. Hub: POST /v1/telegram/setup. */
    public function postActionTelegramSetup(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/telegram/setup', []);
    }

    /** POST /CrmHub/telegram/test. Admin. Hub: POST /v1/telegram/test. */
    public function postActionTelegramTest(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/telegram/test', []);
    }

    /** POST /CrmHub/telegram/send. Usuario con edición del lead. Hub: POST /v1/telegram/send. */
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
    /** POST /CrmHub/twilio/test. Admin. Hub: POST /v1/twilio/test. */
    public function postActionTwilioTest(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubAny('POST', '/v1/twilio/test', []);
    }

    /** POST /CrmHub/sms/send. Usuario con edición del lead. Hub: POST /v1/sms/send. */
    public function postActionSmsSend(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubAny('POST', '/v1/sms/send', ['leadId' => $lead->getId(), 'text' => (string) ($d->text ?? ''),
            'agent' => $this->user->get('name') ?: $this->user->get('userName'), 'userId' => $this->user->getId(), 'phone' => !empty($d->phone) ? (string) $d->phone : null, 'lineId' => $this->lineIdOf($request)]);
    }

    /** POST /CrmHub/sms/test. Admin. Hub: POST /v1/sms/test. */
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
            'agent' => $this->user->get('name') ?: $this->user->get('userName'), 'agentId' => $this->user->getId(), 'lineId' => $this->lineIdOf($request)]);
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
    /** Exige permiso de asignación distinto de «no» para mensajes masivos. */
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

    /** POST /CrmHub/broadcast/audience. Usuario con permiso de masivos. Calcula la audiencia. */
    public function postActionBroadcastAudience(Request $request): \stdClass
    {
        $this->broadcastGuard();
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $channel = in_array($d['channel'] ?? '', ['whatsapp', 'sms', 'telegram'], true) ? $d['channel'] : 'whatsapp';
        $a = $this->audience((array) ($d['filters'] ?? []), $channel);
        return (object) ['count' => count($a['ids']), 'sample' => $a['sample']];
    }

    /** POST /CrmHub/broadcast. Usuario con permiso de masivos. Hub: POST /v1/broadcasts. */
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

    /** GET /CrmHub/broadcasts. Usuario con permiso de masivos. Hub: GET /v1/broadcasts. */
    public function getActionBroadcasts(Request $request): \stdClass
    {
        $this->broadcastGuard();
        return (object) $this->hubAny('GET', '/v1/broadcasts');
    }

    /** GET /CrmHub/broadcasts/:id. Usuario con permiso de masivos. Hub: GET /v1/broadcasts/{id}. */
    public function getActionBroadcast(Request $request): \stdClass
    {
        $this->broadcastGuard();
        return (object) $this->hubAny('GET', '/v1/broadcasts/' . (int) $request->getRouteParam('id'));
    }

    /** POST /CrmHub/broadcasts/:id/:act. Usuario con permiso de masivos. Hub: POST /v1/broadcasts/{id}/{act}. */
    public function postActionBroadcastAction(Request $request): \stdClass
    {
        $this->broadcastGuard();
        $act = (string) $request->getRouteParam('act');
        if (!in_array($act, ['pause', 'resume', 'cancel'], true)) {
            throw new BadRequest();
        }
        return (object) $this->hubAny('POST', '/v1/broadcasts/' . (int) $request->getRouteParam('id') . '/' . $act, []);
    }

    // ---------- Copias y limpieza de leads (solo administrador) ----------
    private const BK_CHILDREN = ['Note', 'Task', 'Call', 'Meeting'];

    /** Carpeta donde se guardan las copias de leads. */
    private function bkDir(): string
    {
        $d = 'data/lead-backups';
        if (!is_dir($d)) {
            @mkdir($d, 0770, true);
        }
        return $d;
    }

    /** Índice de copias (arreglo leído del disco). */
    private function bkIndex(): array
    {
        $f = $this->bkDir() . '/index.json';
        $a = is_file($f) ? json_decode((string) file_get_contents($f), true) : [];
        return is_array($a) ? $a : [];
    }

    /** Guarda el índice de copias. */
    private function bkSaveIndex(array $a): void
    {
        file_put_contents($this->bkDir() . '/index.json', json_encode(array_values($a), JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    /** Busca una copia por id. */
    private function bkFind(string $id): array
    {
        foreach ($this->bkIndex() as $b) {
            if (($b['id'] ?? '') === $id && preg_match('/^[a-f0-9]{16}$/', $id)) {
                return $b;
            }
        }
        throw new BadRequest('Copia no encontrada.');
    }

    /** Crea una copia (JSON por líneas comprimido) de todos los leads y de sus notas, tareas, llamadas y reuniones. */
    private function bkCreate(string $reason, string $note): array
    {
        @set_time_limit(0);
        $id = bin2hex(random_bytes(8));
        $path = $this->bkDir() . '/' . $id . '.jsonl.gz';
        $gz = gzopen($path, 'wb6');
        $counts = ['Lead' => 0, 'Note' => 0, 'Task' => 0, 'Call' => 0, 'Meeting' => 0];
        $repo = $this->em->getRDBRepository('Lead');
        $leadIds = [];
        foreach ($repo->select(['id'])->order('createdAt')->find() as $l) {
            $leadIds[] = $l->getId();
        }
        foreach (array_chunk($leadIds, 200) as $chunk) {
            foreach ($repo->where(['id' => $chunk])->find() as $lead) {
                $lead->loadLinkMultipleField('teams');
                gzwrite($gz, json_encode(['t' => 'Lead', 'd' => $lead->getValueMap()], JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR) . "\n");
                $counts['Lead']++;
            }
            foreach (self::BK_CHILDREN as $t) {
                foreach ($this->em->getRDBRepository($t)->where(['parentType' => 'Lead', 'parentId' => $chunk])->find() as $r) {
                    gzwrite($gz, json_encode(['t' => $t, 'd' => $r->getValueMap()], JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR) . "\n");
                    $counts[$t]++;
                }
            }
        }
        gzclose($gz);
        $b = ['id' => $id, 'createdAt' => gmdate('Y-m-d H:i:s'), 'by' => (string) ($this->user->get('name') ?: $this->user->get('userName')),
            'reason' => $reason, 'note' => mb_substr($note, 0, 120), 'counts' => $counts, 'size' => filesize($path)];
        $idx = $this->bkIndex();
        array_unshift($idx, $b);
        $this->bkSaveIndex($idx);
        return $b;
    }

    /** GET /CrmHub/leadBackups. Admin. Lista las copias. */
    public function getActionLeadBackups(Request $request): \stdClass
    {
        $this->admin();
        $n = $this->em->getRDBRepository('Lead')->count();
        return (object) ['items' => $this->bkIndex(), 'leads' => $n];
    }

    /** POST /CrmHub/leadBackupCreate. Admin. Crea una copia manual. */
    public function postActionLeadBackupCreate(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->bkCreate('manual', trim((string) ($request->getParsedBody()->note ?? '')));
    }

    /** POST /CrmHub/leadBackupDelete. Admin. Elimina una copia. */
    public function postActionLeadBackupDelete(Request $request): \stdClass
    {
        $this->admin();
        $b = $this->bkFind((string) ($request->getParsedBody()->id ?? ''));
        @unlink($this->bkDir() . '/' . $b['id'] . '.jsonl.gz');
        $this->bkSaveIndex(array_filter($this->bkIndex(), fn($x) => ($x['id'] ?? '') !== $b['id']));
        return (object) ['ok' => true];
    }

    /** Devuelve el contenido de la copia para descargarlo como archivo. */
    public function getActionLeadBackupDownload(Request $request): \stdClass
    {
        $this->admin();
        $b = $this->bkFind((string) $request->getQueryParam('id'));
        $rows = [];
        $gz = gzopen($this->bkDir() . '/' . $b['id'] . '.jsonl.gz', 'rb');
        while ($gz && !gzeof($gz)) {
            $line = gzgets($gz);
            if ($line !== false && trim($line) !== '') {
                $rows[] = json_decode($line);
            }
        }
        if ($gz) {
            gzclose($gz);
        }
        return (object) ['backup' => $b, 'rows' => $rows];
    }

    /** Limpia todos los leads (y sus notas, tareas, llamadas y reuniones). Siempre crea antes una copia. */
    public function postActionLeadClean(Request $request): \stdClass
    {
        $this->admin();
        if (trim((string) ($request->getParsedBody()->confirm ?? '')) !== 'LIMPIAR') {
            throw new BadRequest('Escribe LIMPIAR para confirmar.');
        }
        if ($this->em->getRDBRepository('Lead')->count() === 0) {
            return (object) ['backup' => null, 'removed' => 0];
        }
        @set_time_limit(0);
        $b = $this->bkCreate('before-clean', 'Copia automática antes de limpiar');
        $repo = $this->em->getRDBRepository('Lead');
        $removed = 0;
        do {
            $batch = iterator_to_array($repo->limit(0, 200)->find(), false);
            foreach ($batch as $lead) {
                foreach (self::BK_CHILDREN as $t) {
                    foreach ($this->em->getRDBRepository($t)->where(['parentType' => 'Lead', 'parentId' => $lead->getId()])->find() as $r) {
                        $this->em->removeEntity($r, ['skipProcesses' => true]);
                    }
                }
                $this->em->removeEntity($lead, ['skipProcesses' => true]);
                $removed++;
            }
        } while (count($batch) === 200);
        return (object) ['backup' => $b, 'removed' => $removed];
    }

    /** Restaura una copia: recupera los registros que faltan (no toca los leads que ya existen). */
    public function postActionLeadRestore(Request $request): \stdClass
    {
        $this->admin();
        $b = $this->bkFind((string) ($request->getParsedBody()->id ?? ''));
        @set_time_limit(0);
        $opts = ['skipHooks' => true, 'silent' => true, 'skipProcesses' => true];
        $done = ['Lead' => 0, 'Note' => 0, 'Task' => 0, 'Call' => 0, 'Meeting' => 0];
        $skipped = 0;
        $gz = gzopen($this->bkDir() . '/' . $b['id'] . '.jsonl.gz', 'rb');
        while ($gz && !gzeof($gz)) {
            $line = gzgets($gz);
            $row = $line === false ? null : json_decode($line, true);
            if (!$row || !in_array($row['t'] ?? '', array_merge(['Lead'], self::BK_CHILDREN), true) || empty($row['d']['id'])) {
                continue;
            }
            $t = $row['t'];
            $data = $row['d'];
            unset($data['deleted']);
            $repo = $this->em->getRDBRepository($t);
            if ($this->em->getEntityById($t, $data['id'])) {
                $skipped++;
                continue;
            }
            $trash = $repo->clone($this->em->getQueryBuilder()->select()->from($t)->where(['id' => $data['id']])->withDeleted()->build())->findOne();
            if ($trash) {
                $repo->restoreDeleted($data['id']);
                $e = $this->em->getEntityById($t, $data['id']);
            } else {
                $e = $this->em->getNewEntity($t);
            }
            if (!$e) {
                continue;
            }
            $e->set($data);
            $this->em->saveEntity($e, $opts);
            $done[$t]++;
        }
        if ($gz) {
            gzclose($gz);
        }
        return (object) ['restored' => $done, 'skipped' => $skipped];
    }

    // ---------- Simulador del proceso comercial y banco de conocimiento ----------
    /** Bloquea al usuario API y al de portal. */
    private function simGuard(): void
    {
        if ($this->user->isApi() || $this->user->isPortal()) {
            throw new Forbidden();
        }
    }

    /** Filtro de usuario: vacío para admin (ve todo), el propio id para el resto. */
    private function simScope(): string
    {
        return $this->user->isAdmin() ? '' : $this->user->getId();   // el administrador ve las simulaciones de todos; cada usuario, las suyas
    }

    /** GET /CrmHub/simConfig. Usuario (no API ni portal). Hub: GET /v1/sim/config. */
    public function getActionSimConfig(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) ($this->hubAny('GET', '/v1/sim/config') + ['email' => (string) $this->user->get('emailAddress'), 'phone' => (string) $this->user->get('phoneNumber')]);
    }

    /** POST /CrmHub/simRun. Usuario (no API ni portal). Hub: POST /v1/sim/runs. */
    public function postActionSimRun(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        $steps = array_values(array_filter((array) ($d->steps ?? []), 'is_string'));
        return (object) $this->hubAny('POST', '/v1/sim/runs', [
            'userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')),
            'name' => mb_substr(trim((string) ($d->name ?? '')), 0, 80), 'email' => mb_substr(trim((string) ($d->email ?? '')), 0, 120),
            'phone' => mb_substr(trim((string) ($d->phone ?? '')), 0, 30), 'real' => !isset($d->real) || (bool) $d->real, 'steps' => $steps,
        ]);
    }

    /** GET /CrmHub/simRuns. Usuario (no API ni portal). Hub: GET /v1/sim/runs. */
    public function getActionSimRuns(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubAny('GET', '/v1/sim/runs?userId=' . rawurlencode($this->simScope()));
    }

    /** GET /CrmHub/simRun. Usuario (no API ni portal). Hub: GET /v1/sim/runs/{id}. */
    public function getActionSimRun(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubAny('GET', '/v1/sim/runs/' . (int) $request->getQueryParam('id') . '?userId=' . rawurlencode($this->simScope()));
    }

    /** POST /CrmHub/simDelete. Usuario (no API ni portal). Hub: GET y DELETE /v1/sim/runs/{id}. */
    public function postActionSimDelete(Request $request): \stdClass
    {
        $this->simGuard();
        $id = (int) ($request->getParsedBody()->id ?? 0);
        $hub = new HubClient($this->config);
        try {
            $run = $hub->request('GET', '/v1/sim/runs/' . $id . '?userId=' . rawurlencode($this->simScope()), null, 20);
        } catch (\RuntimeException $e) {
            throw new BadRequest('Simulación no encontrada.');
        }
        // solo se borra lo que creó la simulación y está marcado como tal (lead con isSimulation o nombre/asunto «[Simulación]…»), uno por uno
        foreach (array_reverse((array) ($run['refs'] ?? [])) as $ref) {
            $scope = (string) ($ref['scope'] ?? '');
            if (!in_array($scope, ['Lead', 'Account', 'Contact', 'Opportunity', 'Call', 'Meeting', 'Task', 'Email'], true)) {
                continue;
            }
            $e = $this->em->getEntityById($scope, (string) ($ref['id'] ?? ''));
            if (!$e) {
                continue;
            }
            $marked = $scope === 'Lead' ? (bool) $e->get('isSimulation') : str_starts_with((string) $e->get('name'), '[Simulación]');
            if ($marked) {
                $this->em->removeEntity($e);
            }
        }
        try {
            return (object) $hub->request('DELETE', '/v1/sim/runs/' . $id . '?userId=' . rawurlencode($this->simScope()), null, 20);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo eliminar la simulación.');
        }
    }

    /** GET /CrmHub/kb. Usuario (no API ni portal). Hub: GET /v1/kb. */
    public function getActionKb(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubAny('GET', '/v1/kb');
    }

    /** POST /CrmHub/kbRefresh. Usuario (no API ni portal). Hub: POST /v1/kb/refresh. */
    public function postActionKbRefresh(Request $request): \stdClass
    {
        $this->simGuard();
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/kb/refresh', [], 280);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo actualizar el banco de conocimiento.');
        }
    }

    /** POST /CrmHub/kbNote. Usuario (no API ni portal). Hub: POST /v1/kb/notes. */
    public function postActionKbNote(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubAny('POST', '/v1/kb/notes', ['userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')), 'text' => (string) ($d->text ?? '')]);
    }

    /** POST /CrmHub/kbNoteDelete. Usuario (no API ni portal). Hub: DELETE /v1/kb/notes/{id}. */
    public function postActionKbNoteDelete(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        try {
            $r = (new HubClient($this->config))->request('DELETE', '/v1/kb/notes/' . (int) ($d->id ?? 0) . '?userId=' . rawurlencode($this->simScope()), null, 20);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo eliminar la nota.');
        }
        return (object) $r;
    }

    /**
     * WhatsApp, SMS y Telegram guardan la conversación en el lead de la persona. Cuando ya es cuenta, contacto u oportunidad se sigue usando ese mismo
     * hilo (el lead del que nació); si el registro se creó a mano y no tiene lead, se crea uno de conversación (estado «Converted», fuera de los reportes).
     */
    public function postActionThread(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $scope = (string) ($d->scope ?? '');
        if ($this->user->isApi() || !in_array($scope, ['Account', 'Contact', 'Opportunity'], true)) {
            throw new BadRequest();
        }
        $rec = $this->em->getEntityById($scope, (string) ($d->id ?? ''));
        if (!$rec || !$this->acl->checkEntityRead($rec)) {
            throw new Forbidden();
        }
        $t = (new \Espo\Custom\Services\LeadThread($this->em, $this->user))->resolve($scope, $rec);
        return (object) $t;
    }

    // ---------- Plantillas personales de cada usuario (hasta 10 por canal) ----------
    /** GET /CrmHub/templates. Usuario (no API ni portal). Hub: GET /v1/tpl del propio usuario. */
    public function getActionTemplates(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubAny('GET', '/v1/tpl?userId=' . rawurlencode($this->user->getId()));
    }

    /** POST /CrmHub/templateSave. Usuario (no API ni portal). Guarda una plantilla personal en el Hub. */
    public function postActionTemplateSave(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        $channel = (string) ($d->channel ?? '');
        $body = (string) ($d->body ?? '');
        try {
            return (object) (new HubClient($this->config))->request('POST', '/v1/tpl', [
                'userId' => $this->user->getId(), 'channel' => $channel, 'name' => (string) ($d->name ?? ''), 'subject' => (string) ($d->subject ?? ''),
                'body' => $channel === 'email' ? $this->cleanHtml($body) : $body, 'id' => !empty($d->id) ? (int) $d->id : null,
                'design' => $channel === 'email' && !empty($d->design) && is_string($d->design) ? $d->design : null,
            ], 20);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest(isset($m[1]) ? json_decode('"' . $m[1] . '"') : 'No se pudo guardar la plantilla.');
        }
    }

    /** POST /CrmHub/templateDelete. Usuario (no API ni portal). Elimina una plantilla personal en el Hub. */
    public function postActionTemplateDelete(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        try {
            return (object) (new HubClient($this->config))->request('DELETE', '/v1/tpl/' . (int) ($d->id ?? 0) . '?userId=' . rawurlencode($this->user->getId()), null, 20);
        } catch (\RuntimeException $e) {
            throw new BadRequest('No se pudo eliminar la plantilla.');
        }
    }

    /** Lead donde viven las conversaciones de una cuenta, contacto u oportunidad (sin crearlo): el lead del que nació o uno con el mismo teléfono. */
    private function threadLeadId(\Espo\ORM\Entity $rec): ?string
    {
        $scope = $rec->getEntityType();
        $account = $scope === 'Account' ? $rec : ($rec->get('accountId') ? $this->em->getEntityById('Account', (string) $rec->get('accountId')) : null);
        $col = ['Account' => 'createdAccountId', 'Contact' => 'createdContactId', 'Opportunity' => 'createdOpportunityId'][$scope] ?? null;
        $repo = $this->em->getRDBRepository('Lead');
        $lead = $col ? $repo->where([$col => $rec->getId()])->findOne() : null;
        if (!$lead && $account) {
            $lead = $repo->where(['createdAccountId' => $account->getId()])->findOne();
        }
        $phone = trim((string) $rec->get('phoneNumber')) ?: trim((string) ($account?->get('phoneNumber') ?? ''));
        if (!$lead && $phone !== '') {
            $lead = $repo->where(['phoneNumber' => $phone])->findOne();
        }
        return $lead?->getId();
    }

    // ---------- Procesos al llegar un lead (API/webhook con la identificación y datos del lead) ----------
    /** Llama al Hub con timeout propio; error del Hub pasa a BadRequest. */
    private function hubCall(string $method, string $path, ?array $body, int $timeout = 30): array
    {
        try {
            return (new HubClient($this->config))->request($method, $path, $body, $timeout);
        } catch (\RuntimeException $e) {
            preg_match('/"detail":"([^"]+)"/u', $e->getMessage(), $m);
            throw new BadRequest(isset($m[1]) ? (string) json_decode('"' . $m[1] . '"') : 'No se pudo completar la operación.');
        }
    }

    /** GET /CrmHub/processes. Admin. Hub: GET /v1/processes. */
    public function getActionProcesses(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('GET', '/v1/processes', null, 10);
    }

    /** POST /CrmHub/processesSave. Admin. Hub: PUT /v1/processes. */
    public function postActionProcessesSave(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/processes', ['processes' => json_decode(json_encode($d->processes ?? []), true)], 20);
    }

    /** POST /CrmHub/processTest. Admin. Hub: POST /v1/processes/test. */
    public function postActionProcessTest(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        $leadId = null;
        if (!empty($d->leadId)) {
            $lead = $this->em->getEntityById('Lead', (string) $d->leadId);
            $leadId = $lead && $this->acl->checkEntityRead($lead) ? $lead->getId() : null;
        }
        return (object) $this->hubCall('POST', '/v1/processes/test', ['process' => json_decode(json_encode($d->process ?? []), true), 'leadId' => $leadId], 60);
    }

    /** GET /CrmHub/processRuns. Lectura del lead (o admin sin lead). Hub: GET /v1/process/runs. */
    public function getActionProcessRuns(Request $request): \stdClass
    {
        $leadId = (string) $request->getQueryParam('leadId');
        if ($leadId !== '') {
            $lead = $this->em->getEntityById('Lead', $leadId);
            if (!$lead || !$this->acl->checkEntityRead($lead)) {
                throw new Forbidden();
            }
        } else {
            $this->admin();
        }
        return (object) $this->hubCall('GET', '/v1/process/runs?leadId=' . rawurlencode($leadId), null, 10);
    }

    /** Ejecuta de nuevo los procesos de un lead (quien puede editar el lead). */
    public function postActionProcessRun(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->em->getEntityById('Lead', (string) ($d->leadId ?? ''));
        if (!$lead || !$this->acl->checkEntityEdit($lead)) {
            throw new Forbidden();
        }
        return (object) $this->hubCall('POST', '/v1/process/trigger', ['leadId' => $lead->getId(), 'manual' => true, 'processId' => !empty($d->processId) ? (string) $d->processId : null], 30);
    }

    // ---------- Lectura de documentos (PDF) ----------
    /** Lead de la petición; 403 si falta permiso de edición ($edit) o de lectura. */
    private function docLead(string $id, bool $edit): \Espo\ORM\Entity
    {
        $lead = $this->em->getEntityById('Lead', $id);
        if (!$lead || !($edit ? $this->acl->checkEntityEdit($lead) : $this->acl->checkEntityRead($lead))) {
            throw new Forbidden();
        }
        return $lead;
    }

    // ---------- Formularios internos (Hub: /v1/iforms*; diseñan gerentes, directores y supervisores)
    /** Quien puede diseñar formularios: administrador o con permiso de asignación (gerente, director, supervisor). */
    private function canManageForms(): bool
    {
        return $this->assignmentLevel() !== 'no';
    }

    /** GET /CrmHub/iforms[?all=1]. Usuario (no API ni portal). Formularios activos y catálogos; con all=1 (solo quien los diseña) incluye los inactivos. Hub: GET /v1/iforms. */
    public function getActionIforms(Request $request): \stdClass
    {
        $this->simGuard();
        $all = $request->getQueryParam('all') && $this->canManageForms();
        $r = $this->hubCall('GET', '/v1/iforms?all=' . ($all ? 'true' : 'false'), null, 10);
        $r['canManage'] = $this->canManageForms();
        return (object) $r;
    }

    /** POST /CrmHub/iformsSave. Gerente, director o supervisor. {forms}. Hub: PUT /v1/iforms. */
    public function postActionIformsSave(Request $request): \stdClass
    {
        if (!$this->canManageForms()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/iforms', ['forms' => json_decode(json_encode($d->forms ?? []), true), 'by' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 30);
    }

    /** GET /CrmHub/webSources[?all=1]. Usuario (no API ni portal). Consultas web guardadas (solo activas; con all=1 y permiso de diseño, también las inactivas). Hub: GET /v1/websources. */
    public function getActionWebSources(Request $request): \stdClass
    {
        $this->simGuard();
        $all = $request->getQueryParam('all') && $this->canManageForms();
        $r = $this->hubCall('GET', '/v1/websources?all=' . ($all ? 'true' : 'false'), null, 10);
        $r['canManage'] = $this->canManageForms();
        return (object) $r;
    }

    /** POST /CrmHub/webSourcesSave. Gerente, director o supervisor. {sources}. Hub: PUT /v1/websources. */
    public function postActionWebSourcesSave(Request $request): \stdClass
    {
        if (!$this->canManageForms()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/websources', ['sources' => json_decode(json_encode($d->sources ?? []), true)], 30);
    }

    /** POST /CrmHub/webSourceRun. Usuario con edición del lead. {leadId, sourceId}: consulta la página, deja el resultado en una nota del lead y lo devuelve. Hub: POST /v1/websources/run. */
    public function postActionWebSourceRun(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/websources/run', ['sourceId' => (string) ($d->sourceId ?? ''), 'leadId' => $lead->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 90);
    }

    /** POST /CrmHub/webSession. Gerente, director o supervisor. {op: open|action|close, id?, url?, type?, x?, y?, text?, key?, dy?}: navegador de grabación (Chromium) para armar una consulta web con login y navegación. Hub: /v1/websessions. */
    public function postActionWebSession(Request $request): \stdClass
    {
        if (!$this->canManageForms()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        $op = (string) ($d->op ?? '');
        $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d->id ?? ''));
        if ($op === 'open') {
            return (object) $this->hubCall('POST', '/v1/websessions', ['url' => (string) ($d->url ?? '')], 60);
        }
        if ($id === '') {
            throw new BadRequest();
        }
        if ($op === 'close') {
            return (object) $this->hubCall('DELETE', '/v1/websessions/' . $id, null, 20);
        }
        return (object) $this->hubCall('POST', '/v1/websessions/' . $id . '/action', ['type' => (string) ($d->type ?? ''), 'x' => (int) ($d->x ?? 0), 'y' => (int) ($d->y ?? 0), 'text' => (string) ($d->text ?? ''),
            'key' => (string) ($d->key ?? ''), 'url' => (string) ($d->url ?? ''), 'dy' => (int) ($d->dy ?? 0)], 60);
    }

    // ---------- Reportes y tableros (BI): cada usuario arma y guarda los suyos (Hub: /v1/bi/*; datos del CRM con sus permisos)
    private function biQuery(): \Espo\Custom\Services\BiQuery
    {
        $this->simGuard();
        return new \Espo\Custom\Services\BiQuery($this->user, $this->acl, $this->em, $this->selectBuilderFactory, $this->metadata, $this->language, $this->config);
    }

    private function biWho(): string
    {
        return 'userId=' . urlencode($this->user->getId()) . '&teams=' . urlencode(implode(',', $this->user->getLinkMultipleIdList('teams')));
    }

    /** GET /CrmHub/biItems. Usuario. Reportes y tableros propios o compartidos con él, y los datos (CRM y formularios) con los que puede armarlos. */
    public function getActionBiItems(Request $request): \stdClass
    {
        $q = $this->biQuery();
        $r = $this->hubCall('GET', '/v1/bi/items?' . $this->biWho(), null, 15);
        return (object) ['items' => $r['items'] ?? [], 'sources' => array_merge($q->meta(), $r['forms'] ?? []), 'canPublish' => $this->canManageForms()];
    }

    /** GET /CrmHub/biItem?id=. Usuario con acceso. Definición completa de un reporte o tablero. */
    public function getActionBiItem(Request $request): \stdClass
    {
        $this->simGuard();
        $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $request->getQueryParam('id'));
        return (object) $this->hubCall('GET', '/v1/bi/item?id=' . $id . '&' . $this->biWho(), null, 15);
    }

    /** POST /CrmHub/biSave. Usuario. {id?, kind, name, definition, share}. Guarda un reporte o tablero (solo su dueño o un gerente lo cambia). Hub: PUT /v1/bi/item. */
    public function postActionBiSave(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/bi/item', ['id' => !empty($d->id) ? (string) $d->id : null, 'kind' => (string) ($d->kind ?? ''), 'name' => (string) ($d->name ?? ''), 'definition' => json_decode(json_encode($d->definition ?? new \stdClass()), true) ?: new \stdClass(),
            'share' => (string) ($d->share ?? 'none'), 'userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')), 'teams' => $this->user->getLinkMultipleIdList('teams'), 'manager' => $this->canManageForms()], 20);
    }

    /** POST /CrmHub/biDelete. Usuario. {id}. Hub: DELETE /v1/bi/item. */
    public function postActionBiDelete(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d->id ?? ''));
        return (object) $this->hubCall('DELETE', '/v1/bi/item?id=' . $id . '&userId=' . urlencode($this->user->getId()) . '&manager=' . ($this->canManageForms() ? 'true' : 'false'), null, 15);
    }

    /** GET /CrmHub/biPins. Usuario. Tableros que fijó en su escritorio (Inicio), con su vigencia. Hub: GET /v1/bi/pins. */
    public function getActionBiPins(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubCall('GET', '/v1/bi/pins?' . $this->biWho(), null, 15);
    }

    /** POST /CrmHub/biPin. Usuario. {id, dateFrom?, dateTo?}. Fija (o cambia la vigencia de) un tablero en su escritorio. Hub: PUT /v1/bi/pin. */
    public function postActionBiPin(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/bi/pin', ['id' => preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d->id ?? '')), 'userId' => $this->user->getId(), 'teams' => $this->user->getLinkMultipleIdList('teams'),
            'dateFrom' => (string) ($d->dateFrom ?? ''), 'dateTo' => (string) ($d->dateTo ?? ''), 'tab' => (string) ($d->tab ?? ''), 'place' => (string) ($d->place ?? 'top')], 15);
    }

    /** GET /CrmHub/homeTabs. Usuario. Nombres de las pestañas de su escritorio (Inicio), para elegir en cuál fijar un tablero. */
    public function getActionHomeTabs(Request $request): \stdClass
    {
        $this->simGuard();
        $prefs = $this->em->getEntityById('Preferences', $this->user->getId());
        $layout = $prefs ? $prefs->get('dashboardLayout') : null;
        if (empty($layout)) {
            $layout = $this->config->get('dashboardLayout');
        }
        $names = [];
        foreach ((array) $layout as $t) {
            $n = is_object($t) ? ($t->name ?? '') : ($t['name'] ?? '');
            if ($n !== '') {
                $names[] = (string) $n;
            }
        }
        return (object) ['tabs' => array_values(array_unique($names))];
    }

    /** POST /CrmHub/biUnpin. Usuario. {id}. Quita un tablero de su escritorio (no lo elimina). Hub: DELETE /v1/bi/pin. */
    public function postActionBiUnpin(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('DELETE', '/v1/bi/pin?id=' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d->id ?? '')) . '&userId=' . urlencode($this->user->getId()), null, 15);
    }

    /** POST /CrmHub/biPinMove. Usuario. {id, up}. Sube o baja un tablero en el orden de su escritorio. Hub: POST /v1/bi/pinmove. */
    public function postActionBiPinMove(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/bi/pinmove', ['id' => preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d->id ?? '')), 'userId' => $this->user->getId(), 'up' => !empty($d->up)], 15);
    }

    /** POST /CrmHub/biRun. Usuario. {source, filters, groups, measures, limit}. Resultado del reporte con los permisos del usuario (CRM) o sobre un formulario interno (Hub). */
    public function postActionBiRun(Request $request): \stdClass
    {
        $q = $this->biQuery();
        $d = json_decode(json_encode($request->getParsedBody()), true) ?: [];
        $src = (string) ($d['source'] ?? '');
        if (str_starts_with($src, 'form:')) {
            return (object) $this->hubCall('POST', '/v1/bi/formquery', ['formId' => substr($src, 5), 'query' => $d, 'leadIds' => $q->visibleLeadIds()], 60);
        }
        return (object) $q->run($d);
    }

    /** POST /CrmHub/iformWebPreview. Gerente, director o supervisor. {url}: devuelve la página (saneada) para elegir visualmente qué datos traer. Hub: POST /v1/iforms/webpreview. */
    public function postActionIformWebPreview(Request $request): \stdClass
    {
        if (!$this->canManageForms()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/iforms/webpreview', ['url' => (string) ($d->url ?? '')], 40);
    }

    /** POST /CrmHub/iformWebPick. Gerente, director o supervisor. {previewId, idx}: selector CSS y texto de muestra del elemento elegido. Hub: POST /v1/iforms/webpick. */
    public function postActionIformWebPick(Request $request): \stdClass
    {
        if (!$this->canManageForms()) {
            throw new Forbidden();
        }
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/iforms/webpick', ['previewId' => (string) ($d->previewId ?? ''), 'idx' => (int) ($d->idx ?? -1)], 15);
    }

    /** GET /CrmHub/iformEntries?leadId=. Usuario con lectura del lead. Respuestas de los formularios del lead. Hub: GET /v1/iforms/entries. */
    public function getActionIformEntries(Request $request): \stdClass
    {
        $lead = $this->docLead((string) $request->getQueryParam('leadId'), false);
        return (object) $this->hubCall('GET', '/v1/iforms/entries?leadId=' . urlencode($lead->getId()), null, 10);
    }

    /** POST /CrmHub/iformEntry. Usuario con edición del lead. {leadId, formId, values, entryId?, partial?}. Guarda las respuestas y ejecuta las acciones «al guardar». Hub: POST /v1/iforms/entry. */
    public function postActionIformEntry(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/iforms/entry', ['leadId' => $lead->getId(), 'formId' => (string) ($d->formId ?? ''), 'values' => json_decode(json_encode($d->values ?? []), true) ?: new \stdClass(),
            'entryId' => !empty($d->entryId) ? (int) $d->entryId : null, 'partial' => !empty($d->partial), 'userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 90);
    }

    /** POST /CrmHub/iformAction. Usuario con edición del lead. {leadId, entryId, actionId}. Ejecuta una acción de botón del formulario. Hub: POST /v1/iforms/action. */
    public function postActionIformAction(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/iforms/action', ['entryId' => (int) ($d->entryId ?? 0), 'actionId' => (string) ($d->actionId ?? ''), 'leadId' => $lead->getId(),
            'userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 90);
    }

    /** GET /CrmHub/docProfiles. Usuario (no API ni portal). Hub: GET /v1/docs/profiles. */
    public function getActionDocProfiles(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubCall('GET', '/v1/docs/profiles', null, 10);
    }

    /** POST /CrmHub/docProfilesSave. Admin. Hub: PUT /v1/docs/profiles. */
    public function postActionDocProfilesSave(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/docs/profiles', ['profiles' => json_decode(json_encode($d->profiles ?? []), true)], 20);
    }

    /** Lee un PDF que el usuario acaba de subir y devuelve los datos extraídos para que los revise (todavía no se guarda nada en el lead). */
    public function postActionDocExtract(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        $att = $this->em->getEntityById('Attachment', (string) ($d->attachmentId ?? ''));
        if (!$att || $att->get('createdById') !== $this->user->getId() || !str_contains((string) $att->get('type'), 'pdf')) {
            throw new BadRequest('Sube un archivo PDF.');
        }
        // el adjunto se liga al lead: así el Hub (usuario de integración) puede leerlo con los permisos del lead
        if ($att->get('parentId') !== $lead->getId()) {
            $att->set(['parentType' => 'Lead', 'parentId' => $lead->getId()]);
            $this->em->saveEntity($att);
        }
        return (object) $this->hubCall('POST', '/v1/docs/extract', ['leadId' => $lead->getId(), 'attachmentId' => $att->getId(), 'profileId' => (string) ($d->profileId ?? ''), 'userId' => $this->user->getId(),
            'engine' => ($d->engine ?? '') === 'ai' ? 'ai' : 'internal', 'leadName' => (string) $lead->get('name')], 30);
    }

    /** GET /CrmHub/docRun. Edición del lead. Hub: GET /v1/docs/run. */
    public function getActionDocRun(Request $request): \stdClass
    {
        $lead = $this->docLead((string) $request->getQueryParam('leadId'), true);
        return (object) $this->hubCall('GET', '/v1/docs/run?leadId=' . rawurlencode($lead->getId()) . '&runId=' . (int) $request->getQueryParam('runId'), null, 10);
    }

    /** POST /CrmHub/docApply. Edición del lead. Hub: POST /v1/docs/apply (guarda los datos elegidos). */
    public function postActionDocApply(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/docs/apply', ['leadId' => $lead->getId(), 'runId' => (int) ($d->runId ?? 0), 'values' => json_decode(json_encode($d->values ?? new \stdClass()), true), 'items' => isset($d->items) ? json_decode(json_encode($d->items), true) : null,
            'agent' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 60);
    }

    /** Recuerda la selección del usuario como perfil de lectura de la empresa (quien puede editar el lead). */
    public function postActionDocRemember(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/docs/remember', ['name' => (string) ($d->name ?? ''), 'items' => json_decode(json_encode($d->items ?? []), true)], 20);
    }

    /** GET /CrmHub/docPending. Usuario (no API ni portal). Hub: GET /v1/docs/pending. */
    public function getActionDocPending(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubCall('GET', '/v1/docs/pending?userId=' . rawurlencode($this->user->getId()), null, 10);
    }

    /** POST /CrmHub/docDismiss. Usuario (no API ni portal). Hub: POST /v1/docs/dismiss. */
    public function postActionDocDismiss(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/docs/dismiss', ['userId' => $this->user->getId(), 'runId' => (int) ($d->runId ?? 0)], 10);
    }

    /** GET /CrmHub/docHistory. Lectura del lead. Hub: GET /v1/docs/history. */
    public function getActionDocHistory(Request $request): \stdClass
    {
        $lead = $this->docLead((string) $request->getQueryParam('leadId'), false);
        return (object) $this->hubCall('GET', '/v1/docs/history?leadId=' . rawurlencode($lead->getId()), null, 10);
    }

    // ---------- Comercial virtual (versión automática del seguimiento de leads) ----------
    /** GET /CrmHub/agentConfig. Admin. Hub: GET /v1/agent/config. */
    public function getActionAgentConfig(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('GET', '/v1/agent/config?agentId=' . rawurlencode((string) $request->getQueryParam('agentId')), null, 10);
    }

    /** POST /CrmHub/agentConfigSave. Admin. Hub: PUT /v1/agent/config. */
    public function postActionAgentConfigSave(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/agent/config', ['config' => json_decode(json_encode($d->config ?? new \stdClass()), true), 'agentId' => !empty($d->agentId) ? (string) $d->agentId : null, 'name' => isset($d->name) ? (string) $d->name : null], 20);
    }

    /** POST /CrmHub/agentCreate. Admin. Hub: POST /v1/agents. */
    public function postActionAgentCreate(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/agents', ['name' => (string) ($d->name ?? ''), 'cloneFrom' => !empty($d->cloneFrom) ? (string) $d->cloneFrom : null], 20);
    }

    /** POST /CrmHub/agentEnable. Admin. Hub: POST /v1/agents/enabled. */
    public function postActionAgentEnable(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/agents/enabled', ['id' => (string) ($d->id ?? ''), 'enabled' => !empty($d->enabled)], 20);
    }

    /** POST /CrmHub/agentDelete. Admin. Hub: POST /v1/agents/delete. */
    public function postActionAgentDelete(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('POST', '/v1/agents/delete', ['id' => (string) ($request->getParsedBody()->id ?? '')], 20);
    }

    /** POST /CrmHub/agentDispatchSave. Admin. Hub: PUT /v1/agent/dispatch (reparto entre comerciales). */
    public function postActionAgentDispatchSave(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/agent/dispatch', ['mode' => (string) ($d->mode ?? 'shared'), 'weights' => json_decode(json_encode($d->weights ?? new \stdClass()), true) ?: new \stdClass()], 20);
    }

    /** POST /CrmHub/agentTest. Admin. Hub: POST /v1/agent/test. */
    public function postActionAgentTest(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/agent/test', ['sample' => json_decode(json_encode($d->sample ?? new \stdClass()), true)], 290);
    }

    /** POST /CrmHub/agentMenuTest. Admin. Hub: POST /v1/agent/menu-test. */
    public function postActionAgentMenuTest(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/agent/menu-test', ['menuId' => (string) ($d->menuId ?? ''), 'to' => (string) ($d->to ?? ''), 'agentId' => !empty($d->agentId) ? (string) $d->agentId : null], 40);
    }

    /** Un formulario web ya diseñado a partir de una plantilla (se guarda al pulsar «Guardar»). */
    public function getActionFormTemplate(Request $request): \stdClass
    {
        $this->admin();
        $key = preg_replace('/[^a-z0-9_-]/', '', (string) $request->getQueryParam('key'));
        $slugs = preg_replace('/[^a-z0-9,-]/', '', (string) $request->getQueryParam('slugs'));
        return (object) $this->hubCall('GET', '/v1/forms/template/' . $key . '?slugs=' . $slugs, null, 20);
    }

    /** GET /CrmHub/agentStats. Admin. Hub: GET /v1/agent/stats. */
    public function getActionAgentStats(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('GET', '/v1/agent/stats?days=' . (int) ($request->getQueryParam('days') ?: 30), null, 15);
    }

    /** GET /CrmHub/agentLead. Lectura del lead. Hub: GET /v1/agent/lead. */
    public function getActionAgentLead(Request $request): \stdClass
    {
        $lead = $this->docLead((string) $request->getQueryParam('leadId'), false);
        return (object) $this->hubCall('GET', '/v1/agent/lead?leadId=' . rawurlencode($lead->getId()), null, 10);
    }

    /** GET /CrmHub/agentPending. Admin. Hub: GET /v1/agent/pending. */
    public function getActionAgentPending(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('GET', '/v1/agent/pending', null, 10);
    }

    /** POST /CrmHub/agentApproval. Hub: POST /v1/agent/approval (aprobar o editar un mensaje pendiente). */
    public function postActionAgentApproval(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        return (object) $this->hubCall('POST', '/v1/agent/approval', ['leadId' => $lead->getId(), 'eventId' => (int) ($d->eventId ?? 0), 'message' => isset($d->message) ? (string) $d->message : null,
            'approve' => !empty($d->approve), 'by' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 60);
    }

    /** POST /CrmHub/agentAction. Edición del lead. Hub: POST /v1/agent/lead/action (pause, resume, manual, auto, switch). */
    public function postActionAgentAction(Request $request): \stdClass
    {
        $d = $request->getParsedBody();
        $lead = $this->docLead((string) ($d->leadId ?? ''), true);
        $action = (string) ($d->action ?? '');
        if (!in_array($action, ['pause', 'resume', 'manual', 'auto'], true) && !preg_match('/^switch:[a-z0-9_]{1,30}$/', $action)) {
            throw new BadRequest();
        }
        return (object) $this->hubCall('POST', '/v1/agent/lead/action', ['leadId' => $lead->getId(), 'action' => $action, 'by' => (string) ($this->user->get('name') ?: $this->user->get('userName'))], 20);
    }

    // ---------- Motor de IA de la empresa ----------
    /** GET /CrmHub/aiConfig. Admin. Hub: GET /v1/ai/config. */
    public function getActionAiConfig(Request $request): \stdClass
    {
        $this->admin();
        return (object) $this->hubCall('GET', '/v1/ai/config', null, 10);
    }

    /** POST /CrmHub/aiOwnSave. Admin. Hub: PUT /v1/ai/own (motor de IA propio). */
    public function postActionAiOwnSave(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('PUT', '/v1/ai/own', ['kind' => (string) ($d->kind ?? ''), 'model' => (string) ($d->model ?? ''), 'base_url' => (string) ($d->base_url ?? ''), 'api_key' => (string) ($d->api_key ?? ''), 'workspace_id' => (string) ($d->workspace_id ?? '')], 20);
    }

    /** POST /CrmHub/aiTest. Admin. Hub: POST /v1/ai/test. */
    public function postActionAiTest(Request $request): \stdClass
    {
        $this->admin();
        $d = $request->getParsedBody();
        $body = !empty($d->kind) ? ['kind' => (string) $d->kind, 'model' => (string) ($d->model ?? ''), 'base_url' => (string) ($d->base_url ?? ''), 'api_key' => (string) ($d->api_key ?? ''), 'workspace_id' => (string) ($d->workspace_id ?? '')] : null;
        return (object) $this->hubCall('POST', '/v1/ai/test', $body, 150);
    }
    // ---------- Grabaciones de pantalla y de videollamadas (Hub: /v1/rec*; el video se sube y se reproduce directo con el Hub, con llaves de corta vida)
    private function recManager(): bool
    {
        return $this->assignmentLevel() === 'all';
    }

    /** GET /CrmHub/recList. Usuario (no API ni portal). Sus grabaciones; quien tiene alcance «todos» ve las de toda la empresa. Hub: GET /v1/rec. */
    public function getActionRecList(Request $request): \stdClass
    {
        $this->simGuard();
        $r = $this->hubCall('GET', '/v1/rec?userId=' . urlencode($this->user->getId()) . '&all=' . ($this->recManager() ? 'true' : 'false'), null, 15);
        $r['me'] = $this->user->getId();
        $r['manager'] = $this->recManager();
        return (object) $r;
    }

    /** POST /CrmHub/recStart. Usuario. {title?, audio?, mime?}. Crea la grabación y devuelve la dirección y llave para subir el video. Hub: POST /v1/rec/start. */
    public function postActionRecStart(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('POST', '/v1/rec/start', ['title' => (string) ($d->title ?? ''), 'userId' => $this->user->getId(), 'userName' => (string) ($this->user->get('name') ?: $this->user->get('userName')),
            'audio' => !empty($d->audio), 'mime' => (string) ($d->mime ?? 'video/webm')], 20);
    }

    /** POST /CrmHub/recUpdate. Usuario dueño (o con alcance «todos»). {id, title?, share?}. Hub: POST /v1/rec/{id}/update. */
    public function postActionRecUpdate(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        $b = ['userId' => $this->user->getId(), 'manager' => $this->recManager()];
        if (isset($d->title)) {
            $b['title'] = (string) $d->title;
        }
        if (isset($d->share)) {
            $b['share'] = (bool) $d->share;
        }
        return (object) $this->hubCall('POST', '/v1/rec/' . rawurlencode((string) ($d->id ?? '')) . '/update', $b, 15);
    }

    /** POST /CrmHub/recDelete. Usuario dueño (o con alcance «todos»). {id}. Hub: DELETE /v1/rec/{id}. */
    public function postActionRecDelete(Request $request): \stdClass
    {
        $this->simGuard();
        $d = $request->getParsedBody();
        return (object) $this->hubCall('DELETE', '/v1/rec/' . rawurlencode((string) ($d->id ?? '')) . '?userId=' . urlencode($this->user->getId()) . '&manager=' . ($this->recManager() ? 'true' : 'false'), null, 15);
    }

    /** GET /CrmHub/recPlay?id=. Usuario dueño (o con alcance «todos»). Direcciones de reproducción y descarga (vencen en 4 horas). Hub: GET /v1/rec/{id}/play. */
    public function getActionRecPlay(Request $request): \stdClass
    {
        $this->simGuard();
        return (object) $this->hubCall('GET', '/v1/rec/' . rawurlencode((string) $request->getQueryParam('id')) . '/play?userId=' . urlencode($this->user->getId()) . '&manager=' . ($this->recManager() ? 'true' : 'false'), null, 15);
    }
}
