<?php

namespace Espo\Custom\Services;

use Espo\Core\Acl;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Select\SelectBuilderFactory;
use Espo\Core\Select\Where\Item as WhereItem;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Language;
use Espo\Core\Utils\Metadata;
use Espo\Entities\User;
use Espo\ORM\EntityManager;

/**
 * Reportes y tableros: catálogo de datos que el usuario puede usar (solo lo que su rol le deja leer) y consultas con agrupación y totales sobre el CRM,
 * siempre con el filtro de acceso del usuario (equipo / propio / todo). Las respuestas de los formularios internos las consulta el Hub.
 */
class BiQuery
{
    public const ENTITIES = ['Lead', 'Contact', 'Account', 'Opportunity', 'Task', 'Meeting', 'Call'];
    private const FILTER_TYPES = ['enum', 'varchar', 'bool', 'int', 'float', 'currency', 'date', 'datetime', 'datetimeOptional', 'link', 'url', 'email', 'phone'];
    private const GROUP_TYPES = ['enum', 'varchar', 'bool', 'date', 'datetime', 'link', 'int'];
    private const MEASURE_TYPES = ['int', 'float', 'currency'];
    private const FNS = ['count' => 'COUNT', 'sum' => 'SUM', 'avg' => 'AVG', 'min' => 'MIN', 'max' => 'MAX'];

    /** Los campos «fecha y hora opcional» (inicio de reuniones y llamadas, vencimiento de tareas) se tratan como fecha y hora. */
    private static function norm(string $t): string
    {
        return $t === 'datetimeOptional' ? 'datetime' : $t;
    }

    public function __construct(private User $user, private Acl $acl, private EntityManager $em, private SelectBuilderFactory $sbf, private Metadata $metadata, private Language $language, private Config $config) {}

    /** Entidades y campos disponibles para este usuario. */
    public function meta(): array
    {
        $out = [];
        foreach (self::ENTITIES as $e) {
            if (!$this->acl->checkScope($e, 'read')) {
                continue;
            }
            $fields = [];
            foreach ((array) $this->metadata->get("entityDefs.$e.fields", []) as $name => $d) {
                $t = self::norm((string) ($d['type'] ?? ''));
                if (!empty($d['disabled']) || !empty($d['utility']) || !empty($d['notStorable']) && $t !== 'link' || !in_array($t, array_merge(self::FILTER_TYPES, ['datetime']), true) || !$this->acl->checkField($e, $name, 'read')) {
                    continue;
                }
                $opts = $t === 'enum' ? array_values(array_filter((array) ($d['options'] ?? []), fn ($o) => $o !== '')) : [];
                $fields[] = ['name' => $name, 'label' => $this->language->translateLabel($name, 'fields', $e), 'type' => $t, 'options' => $opts];
            }
            $fields[] = ['name' => 'id', 'label' => 'Registro (conteo)', 'type' => 'id', 'options' => []];
            usort($fields, fn ($a, $b) => strcmp($a['label'], $b['label']));
            $out[] = ['id' => $e, 'label' => $this->language->translate($e, 'scopeNamesPlural'), 'fields' => $fields];
        }
        return $out;
    }

    private function fieldDef(string $e, string $name): array
    {
        $d = $this->metadata->get("entityDefs.$e.fields.$name");
        if (!$d || !$this->acl->checkField($e, $name, 'read')) {
            throw new BadRequest("Campo no disponible: $name");
        }
        return $d;
    }

    private function tzOffset(): int
    {
        try {
            $tz = new \DateTimeZone((string) ($this->config->get('timeZone') ?: 'America/Bogota'));
            return (int) round($tz->getOffset(new \DateTime('now', new \DateTimeZone('UTC'))) / 3600);
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /** Condiciones del reporte en el formato de filtros de EspoCRM. */
    private function where(string $e, array $filters): WhereItem
    {
        $tz = (string) ($this->config->get('timeZone') ?: 'America/Bogota');
        $ok = ['equals', 'notEquals', 'in', 'notIn', 'contains', 'startsWith', 'greaterThan', 'lessThan', 'greaterThanOrEquals', 'lessThanOrEquals', 'between', 'isNull', 'isNotNull', 'isTrue', 'isFalse',
            'today', 'past', 'future', 'currentMonth', 'lastMonth', 'currentYear', 'lastYear', 'lastSevenDays', 'lastXDays', 'nextXDays', 'currentQuarter', 'lastQuarter', 'on', 'after', 'before'];
        $items = [];
        foreach (array_slice($filters, 0, 12) as $f) {
            $name = (string) ($f['field'] ?? '');
            $op = (string) ($f['op'] ?? 'equals');
            if ($name === '' || !in_array($op, $ok, true)) {
                continue;
            }
            $d = $this->fieldDef($e, $name);
            $attr = ($d['type'] ?? '') === 'link' ? $name . 'Id' : $name;
            $item = ['type' => $op, 'attribute' => $attr, 'timeZone' => $tz];
            if (!in_array($op, ['isNull', 'isNotNull', 'isTrue', 'isFalse', 'today', 'past', 'future', 'currentMonth', 'lastMonth', 'currentYear', 'lastYear', 'lastSevenDays', 'currentQuarter', 'lastQuarter'], true)) {
                $v = $f['value'] ?? null;
                if (in_array($op, ['in', 'notIn'], true)) {
                    $v = array_values(array_filter(array_map('trim', is_array($v) ? $v : explode(',', (string) $v)), fn ($x) => $x !== ''));
                } elseif ($op === 'between') {
                    $v = is_array($v) ? array_values($v) : array_map('trim', explode(',', (string) $v));
                }
                $item['value'] = $v;
            }
            $items[] = $item;
        }
        return WhereItem::fromRaw(['type' => 'and', 'value' => $items]);
    }

    /** Ejecuta una consulta {source, filters, groups[{field,bucket?}], measures[{fn,field?}], limit?, order?} y devuelve {rows:[{g1,g2,m1..m4}]}. */
    public function run(array $q): array
    {
        $e = (string) ($q['source'] ?? '');
        if (!in_array($e, self::ENTITIES, true) || !$this->acl->checkScope($e, 'read')) {
            throw new Forbidden();
        }
        $builder = $this->sbf->create()->from($e)->withAccessControlFilter()->withWhere($this->where($e, (array) ($q['filters'] ?? [])))->buildQueryBuilder();
        $select = [];
        $group = [];
        $groups = array_slice((array) ($q['groups'] ?? []), 0, 2);
        $off = $this->tzOffset();
        foreach ($groups as $i => $g) {
            $name = (string) ($g['field'] ?? '');
            $d = $this->fieldDef($e, $name);
            $t = self::norm((string) ($d['type'] ?? ''));
            if (!in_array($t, self::GROUP_TYPES, true)) {
                throw new BadRequest('Ese campo no se puede usar para agrupar.');
            }
            $alias = 'g' . ($i + 1);
            if (in_array($t, ['date', 'datetime'], true)) {
                $b = (string) ($g['bucket'] ?? 'month');
                $fn = ['day' => 'DAY', 'week' => 'WEEK_1', 'month' => 'MONTH', 'year' => 'YEAR'][$b] ?? 'MONTH';
                $inner = $t === 'datetime' ? "TZ:($name, $off)" : $name;
                $expr = "$fn:($inner)";
                $select[] = [$expr, $alias];
                $group[] = $expr;
            } elseif ($t === 'link') {
                $builder->leftJoin($name);
                $select[] = [$name . '.name', $alias];
                $group[] = $name . '.name';
            } else {
                $select[] = [$name, $alias];
                $group[] = $name;
            }
        }
        $measures = array_slice((array) ($q['measures'] ?? []), 0, 4) ?: [['fn' => 'count']];
        foreach ($measures as $i => $m) {
            $fn = self::FNS[(string) ($m['fn'] ?? 'count')] ?? 'COUNT';
            if ($fn === 'COUNT') {
                $select[] = ['COUNT:(id)', 'm' . ($i + 1)];
                continue;
            }
            $name = (string) ($m['field'] ?? '');
            $d = $this->fieldDef($e, $name);
            if (!in_array(self::norm((string) ($d['type'] ?? '')), self::MEASURE_TYPES, true)) {
                throw new BadRequest('Ese campo no se puede sumar ni promediar.');
            }
            $select[] = [$fn . ':(' . $name . ')', 'm' . ($i + 1)];
        }
        $builder->select($select);
        if ($group) {
            $builder->group($group);
            $t1 = self::norm((string) $this->metadata->get("entityDefs.$e.fields." . ($groups[0]['field'] ?? '') . '.type'));
            if (in_array($t1, ['date', 'datetime'], true)) {
                $builder->order($group[0], 'ASC');
            } else {
                $builder->order($select[count($groups)][0], 'DESC');   // por la primera medida
            }
        }
        $builder->limit(0, min(1000, max(1, (int) ($q['limit'] ?? 500))));
        $stmt = $this->em->getQueryExecutor()->execute($builder->build());
        $rows = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $row = [];
            foreach ($r as $k => $v) {
                $row[$k] = str_starts_with($k, 'm') ? (float) $v : ($v === null || $v === '' ? 'Sin valor' : (is_bool($v) ? ($v ? 'Sí' : 'No') : (string) $v));
            }
            $rows[] = $row;
        }
        return ['rows' => $rows];
    }

    /** Ids de los leads que el usuario puede ver (null si puede ver todos), para consultar formularios con sus permisos. */
    public function visibleLeadIds(): ?array
    {
        if ($this->user->isAdmin() || $this->acl->getPermissionLevel('assignmentPermission') === 'all' && $this->acl->getLevel('Lead', 'read') === 'all') {
            return null;
        }
        $b = $this->sbf->create()->from('Lead')->withAccessControlFilter()->buildQueryBuilder()->select(['id'])->limit(0, 20000);
        $ids = [];
        foreach ($this->em->getQueryExecutor()->execute($b->build())->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $ids[] = (string) $r['id'];
        }
        return $ids;
    }
}
