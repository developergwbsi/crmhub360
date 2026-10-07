<?php

namespace Espo\Custom\Controllers;

use Espo\Core\Acl;
use Espo\Core\Api\Request;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Utils\Config;
use Espo\Custom\Services\HubClient;
use Espo\Custom\Services\LeadAssigner;
use Espo\Entities\User;
use Espo\ORM\EntityManager;

/** Panel de integraciones, asignación automática y reasignación de Crm Hub 360. */
class CrmHub
{
    private const REASSIGNABLE = ['Lead', 'Contact', 'Account', 'Opportunity'];

    public function __construct(
        private User $user,
        private Config $config,
        private Acl $acl,
        private EntityManager $em
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
        $allowed = array_intersect_key($data, array_flip(['fb_page_token', 'services']));
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
        $assigner = new LeadAssigner($this->em);
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
        return (object) ['users' => $users, 'campaigns' => $campaigns, 'eligibleTotal' => count($eligible)];
    }

    // ---------- Reasignación (admin, directores y gerentes según su permiso de asignación) ----------
    public function getActionAssignees(Request $request): array
    {
        $level = $this->assignmentLevel();
        if ($level === 'no') {
            throw new Forbidden('No tienes permiso para reasignar.');
        }
        $assigner = new LeadAssigner($this->em);
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
        $assigner = new LeadAssigner($this->em);
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
}
