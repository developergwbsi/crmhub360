<?php

namespace Espo\Custom\Hooks\Email;

use Espo\Core\Exceptions\Forbidden;
use Espo\ORM\Entity;

/** Un correo enviado o recibido no se edita (asunto, cuerpo, remitente, destinatarios, fecha): evita malentendidos. Solo los borradores y los que se están enviando. */
class Immutable
{
    public static int $order = 1;

    private const LOCKED = ['name', 'body', 'bodyPlain', 'isHtml', 'from', 'to', 'cc', 'bcc', 'replyTo', 'dateSent'];

    public function beforeSave(Entity $entity, array $options): void
    {
        if ($entity->isNew() || !in_array($entity->getFetched('status'), ['Sent', 'Archived', 'Received'], true)) {
            return;
        }
        foreach (self::LOCKED as $a) {
            if (!$entity->isAttributeChanged($a)) {
                continue;
            }
            // Espo recalcula en cada guardado algunos de estos campos (direcciones): solo cuenta un cambio real de contenido
            $norm = fn ($v) => strtolower(preg_replace('/\s+/', '', (string) $v));
            $old = $entity->getFetched($a);
            if ($old === null || $old === '' || $norm($old) === $norm($entity->get($a))) {
                continue;
            }
            throw new Forbidden('Un correo enviado o recibido no se puede editar.');
        }
    }
}
