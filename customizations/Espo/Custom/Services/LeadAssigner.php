<?php

namespace Espo\Custom\Services;

use Espo\Core\Utils\Config;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/**
 * Asignación balanceada de leads.
 *  1) Si el lead tiene campaña: usuarios habilitados que pertenecen a los equipos de la campaña.
 *  2) Si no hay campaña (o no hay candidatos): todos los usuarios habilitados para recibir leads.
 * Se elige a quien tenga menos leads abiertos; en empate, a quien lleve más tiempo sin recibir uno.
 */
class LeadAssigner
{
    public const DEFAULT_CLOSED = ['Cierre Exitoso', 'Converted', 'Dead'];

    public function __construct(private EntityManager $em, private ?Config $config = null) {}

    /** @return string[] estados que ya no cuentan como «lead abierto» */
    public function closedStatuses(): array
    {
        $c = $this->config ? $this->config->get('crmhubClosedStatuses') : null;
        return is_array($c) && $c ? array_values($c) : self::DEFAULT_CLOSED;
    }

    /** 'balanced' (menos leads abiertos) | 'roundrobin' (quien lleva más tiempo sin recibir) */
    public function method(): string
    {
        return $this->config && $this->config->get('crmhubAssignMethod') === 'roundrobin' ? 'roundrobin' : 'balanced';
    }

    /** Tope de leads abiertos por asesor; 0 = sin tope. */
    public function cap(): int
    {
        return $this->config ? max(0, (int) $this->config->get('crmhubAssignCap')) : 0;
    }

    /** @return User[] usuarios activos habilitados para recibir leads */
    public function eligibleUsers(): array
    {
        $users = $this->em->getRDBRepository(User::ENTITY_TYPE)
            ->where(['isActive' => true, 'type' => ['regular', 'admin'], 'receivesLeads' => true])
            ->find();
        return iterator_to_array($users, false);
    }

    public function openLeads(string $userId): int
    {
        return $this->em->getRDBRepository('Lead')
            ->where(['assignedUserId' => $userId, 'status!=' => $this->closedStatuses()])
            ->count();
    }

    public function pick(?string $campaignId = null): ?User
    {
        $pool = $this->eligibleUsers();
        if ($campaignId) {
            $campaign = $this->em->getEntityById('Campaign', $campaignId);
            $teamIds = $campaign ? $campaign->getLinkMultipleIdList('teams') : [];
            if ($teamIds) {
                $inCampaign = array_values(array_filter(
                    $pool,
                    fn (User $u) => (bool) array_intersect($teamIds, $u->getLinkMultipleIdList('teams'))
                ));
                if ($inCampaign) {
                    $pool = $inCampaign;
                }
            }
        }
        $load = [];
        foreach ($pool as $u) {
            $load[$u->getId()] = $this->openLeads($u->getId());
        }
        if ($this->cap() > 0) {
            $pool = array_values(array_filter($pool, fn (User $u) => $load[$u->getId()] < $this->cap()));
        }
        if (!$pool) {
            return null;
        }
        $rr = $this->method() === 'roundrobin';
        usort($pool, function (User $a, User $b) use ($load, $rr) {
            $ka = $rr ? [(string) $a->get('lastLeadAssignedAt')] : [$load[$a->getId()], (string) $a->get('lastLeadAssignedAt')];
            $kb = $rr ? [(string) $b->get('lastLeadAssignedAt')] : [$load[$b->getId()], (string) $b->get('lastLeadAssignedAt')];
            return $ka <=> $kb;
        });
        return $pool[0];
    }

    /** Asigna y agrega los equipos del usuario para que su director vea el registro. */
    public function assign(Entity $entity, User $user): void
    {
        $entity->set('assignedUserId', $user->getId());
        $entity->set('assignedUserName', $user->get('name'));
        $teams = array_unique(array_merge($entity->getLinkMultipleIdList('teams'), $user->getLinkMultipleIdList('teams')));
        $entity->set('teamsIds', array_values($teams));
        $this->touch($user->getId());
    }

    private function touch(string $userId): void
    {
        $q = $this->em->getQueryBuilder()->update()->in('User')
            ->set(['lastLeadAssignedAt' => date('Y-m-d H:i:s')])->where(['id' => $userId])->build();
        $this->em->getQueryExecutor()->execute($q);
    }
}
