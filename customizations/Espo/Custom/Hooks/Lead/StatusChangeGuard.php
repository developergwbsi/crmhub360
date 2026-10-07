<?php

namespace Espo\Custom\Hooks\Lead;

use Espo\Core\Exceptions\BadRequest;
use Espo\Custom\Services\LeadTimeline;
use Espo\Entities\User;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

/** Todo cambio de estado hecho por una persona exige un comentario o una acción previa con el lead; queda en el historial. */
class StatusChangeGuard
{
    public static int $order = 20;
    private array $pending = [];

    public function __construct(private EntityManager $em, private User $user) {}

    public function beforeSave(Entity $entity, array $options): void
    {
        if ($entity->isNew() || !$entity->isAttributeChanged('status') || !empty($options['skipStatusGuard'])) {
            return;
        }
        $comment = trim((string) $entity->get('statusComment'));
        if ($this->user->isApi() || $this->user->isSystem()) {
            $this->pending[$entity->getId()] = $comment !== '' ? $comment : 'Automático';
            return;
        }
        $action = (new LeadTimeline($this->em))->priorAction($entity);
        if (mb_strlen($comment) < 3 && !$action) {
            throw new BadRequest('Para cambiar el estado escribe un comentario o registra antes una accion con el lead (llamada, mensaje, correo).');
        }
        $this->pending[$entity->getId()] = mb_strlen($comment) >= 3 ? $comment : 'Acción previa: ' . $action['label'];
    }

    public function afterSave(Entity $entity, array $options): void
    {
        $id = $entity->getId();
        if (!isset($this->pending[$id])) {
            return;
        }
        $text = $this->pending[$id];
        unset($this->pending[$id]);
        $from = (string) $entity->getFetched('status');
        $this->em->createEntity('Note', [
            'type' => 'Post', 'parentType' => 'Lead', 'parentId' => $id,
            'post' => "[Estado] «{$from}» → «{$entity->get('status')}»: {$text}",
        ]);
    }
}
