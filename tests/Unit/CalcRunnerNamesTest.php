<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';
require_once __DIR__ . '/../../scripts/calc_runtime.php';

final class CalcRunnerNamesTest extends MiniTestCase
{
    public function testPeopleByRoleIncludesNames(): void
    {
        $payload = [
            'heirs' => [
                [
                    'role' => 'wife',
                    'count' => 1,
                    'person_ids' => ['sp1'],
                    'persons' => [
                        ['id' => 'sp1', 'name' => 'Aisha'],
                    ],
                ],
                [
                    'role' => 'daughter',
                    'count' => 1,
                    'person_ids' => ['c1'],
                    'persons' => [
                        ['id' => 'c1', 'name' => 'Fatima'],
                    ],
                ],
            ],
        ];

        $result = \App\Scripts\CalcRunner::run($payload);
        $people = $result['people_by_role'] ?? [];
        $this->assertSame([
            'daughter' => [
                ['id' => 'c1', 'name' => 'Fatima'],
            ],
            'wives' => [
                ['id' => 'sp1', 'name' => 'Aisha'],
            ],
        ], $people);
    }
}
