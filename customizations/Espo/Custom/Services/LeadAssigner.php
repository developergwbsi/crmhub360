<?php

namespace Espo\Custom\Services;

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
    private const CLOSED = ['Cierre Exitoso', 'Converted', 'Dead'];

    public function __construct(private EntityManager $em) {}

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
            ->where(['assignedUserId' => $userId, 'status!=' => self::CLOSED])
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
        if (!$pool) {
            return null;
        }
        $load = [];
        foreach ($pool as $u) {
            $load[$u->getId()] = $this->openLeads($u->getId());
        }
        usort($pool, function (User $a, User $b) use ($load) {
            return [$load[$a->getId()], (string) $a->get('lastLeadAssignedAt')]
               <=> [$load[$b->getId()], (string) $b->get('lastLeadAssignedAt')];
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
