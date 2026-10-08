Файл proposals.json проанализирован. Данные разделены на два списка в строгом соответствии с вашим образцом: реестр простых ключей и структурированные пакеты (bundle) для создания связанных сущностей.

Список 1: Реестр ключей (из массива proposals)

В этот список включены только те записи, где флаг in_units_dict равен false (отсутствуют в словаре), а также сложные случаи с множественными написаниями. Для удобства навигации записи сгруппированы по частоте встречаемости.

## Ключи с высокой частотой (10 и более упоминаний):

```json
{
  "unit-957-okshr": {
    "dict_keys": ["957 окшр"],
    "type": "окшр",
    "number": 957,
    "parent": null
  },
  "unit-400-sd": {
    "dict_keys": ["скф 400 сд"],
    "type": "дивизия",
    "number": 400,
    "parent": "unit-skf-front"
  },
  "unit-829-sp": {
    "dict_keys": ["скф 400 сд 829 сп"],
    "type": "полк",
    "number": 829,
    "parent": "unit-400-sd"
  },
  "unit-832-sp": {
    "dict_keys": ["скф 400 сд 832 сп"],
    "type": "полк",
    "number": 832,
    "parent": "unit-400-sd"
  },
  "unit-845-sp": {
    "dict_keys": ["скф 845 п 236 сд"],
    "type": "полк",
    "number": 845,
    "parent": "unit-236-sd"
  },
  "unit-75-oinzhp": {
    "dict_keys": ["СКФ 75 оинжп"],
    "type": "оинжп",
    "number": 75,
    "parent": null
  },
  "unit-223-gmd": {
    "dict_keys": ["скф 223 гмд"],
    "type": "гмд",
    "number": 223,
    "parent": null
  },
  "unit-227-sd": {
    "dict_keys": ["227 сд", "скф 227 сд 44 А"],
    "type": "дивизия",
    "number": 227,
    "parent": "unit-skf-front"
  },
  "unit-384-sp": {
    "dict_keys": ["СКФ 384 сп 157 сд"],
    "type": "полк",
    "number": 384,
    "parent": "unit-157-sd"
  },
  "unit-716-sp": {
    "dict_keys": ["СКФ 716 сп 157 сд"],
    "type": "полк",
    "number": 716,
    "parent": "unit-157-sd"
  }
}
```

## Ключи со средней частотой (от 5 до 9 упоминаний):

```json
{
  "unit-750-otd-inzh-bat": {
    "dict_keys": ["СКФ 750 отд. инж. бат."],
    "type": "отд. инж. бат.",
    "number": 750,
    "parent": null
  },
  "unit-56-tbr": {
    "dict_keys": ["56 тбр"],
    "type": "тбр",
    "number": 56,
    "parent": null
  },
  "unit-220-otd-zen-art-dn": {
    "dict_keys": ["СКФ 220 отд. зен. арт. д н"],
    "type": "отд. зен. арт. д н",
    "number": 220,
    "parent": null
  },
  "unit-195-kp-72-kd": {
    "dict_keys": ["СКФ 195 кп 72 кд"],
    "type": "кп",
    "number": 195,
    "parent": "unit-72-kd"
  },
  "unit-793-otd-kabeln-shest-rota": {
    "dict_keys": ["СКФ 793 отд. кабельн.-шест. рота связи"],
    "type": "отд. кабельн.-шест. рота",
    "number": 793,
    "parent": null
  },
  "unit-834-sp": {
    "dict_keys": ["скф 400 сд 834 сп"],
    "type": "полк",
    "number": 834,
    "parent": "unit-400-sd"
  },
  "unit-665-sp": {
    "dict_keys": ["СКФ 665 сп 404 сд"],
    "type": "полк",
    "number": 665,
    "parent": "unit-404-sd"
  },
  "unit-75-otd-inzh-b": {
    "dict_keys": ["скф 75 отд. инж. б", "СКФ 75 отд. инж. бат."],
    "type": "отд. инж. бат.",
    "number": 75,
    "parent": null
  },
  "unit-63-gsd": {
    "dict_keys": ["63 гсд", "штаб 63 гсд"],
    "type": "гсд",
    "number": 63,
    "parent": null
  }
}
```

## Ключи с низкой частотой (1–4 упоминания, включая уникальные):

```json
{
  "unit-227-sd-789-sp": {
    "dict_keys": ["скф 227 сд 789 сп"],
    "type": "полк",
    "number": 789,
    "parent": "unit-227-sd"
  },
  "unit-25-gv-minp-222-gmd": {
    "dict_keys": ["скф 25 гв. минп 222 гмд"],
    "type": "гв. минп",
    "number": 25,
    "parent": "unit-222-gmd"
  },
  "unit-353-optd-276-sd": {
    "dict_keys": ["СКФ 353 оптд 276 сд"],
    "type": "оптд",
    "number": 353,
    "parent": "unit-276-sd"
  },
  "unit-47-sr-ohrany-47-a": {
    "dict_keys": ["47 ср охраны 47 А"],
    "type": "ср охраны",
    "number": 47,
    "parent": "unit-47-a"
  },
  "unit-679-osapb": {
    "dict_keys": ["679 осапб"],
    "type": "осапб",
    "number": 679,
    "parent": null
  },
  "unit-77-gsd": {
    "dict_keys": ["77 гсд"],
    "type": "гсд",
    "number": 77,
    "parent": "unit-skf-front"
  },
  "unit-796-ap": {
    "dict_keys": ["796 ап"],
    "type": "ап",
    "number": 796,
    "parent": null
  },
  "unit-865-sd": {
    "dict_keys": ["865 сд"],
    "type": "сд",
    "number": 865,
    "parent": null
  },
  "unit-961-sp": {
    "dict_keys": ["961 сп"],
    "type": "сп",
    "number": 961,
    "parent": null
  },
  "unit-pp-492-v-ch-15": {
    "dict_keys": [
      "пп 492 в/ч 15",
      "в/ч 15 ппс 492",
      "п/п 492 в/ч 15",
      "ппс 492 в/ч 15"
    ],
    "type": "ппс",
    "number": 492,
    "parent": null
  },
  "unit-44-a-427-olbs": {
    "dict_keys": ["44 А 427 олбс"],
    "type": "олбс",
    "number": 427,
    "parent": "unit-44-a"
  },
  "unit-44-a-793-okshr": {
    "dict_keys": ["44 А 793 окшр"],
    "type": "окшр",
    "number": 793,
    "parent": "unit-44-a"
  },
  "unit-5-gv-otd-mot-shturm-isb": {
    "dict_keys": ["5 гв. отд. мот. шутрм. исб"],
    "type": "отд. мот. шутрм. исб",
    "number": 5,
    "parent": null
  },
  "unit-13-a-220-otd-art-zen-d-n": {
    "dict_keys": ["13 А 220 отд. арт. зен. д-н"],
    "type": "отд. арт. зен. д-н",
    "number": 220,
    "parent": "unit-13-a"
  },
  "unit-457-ap-rgk": {
    "dict_keys": ["457 ап РГК"],
    "type": "ап",
    "number": 457,
    "parent": null
  },
  "unit-457-zap": {
    "dict_keys": ["457 зап"],
    "type": "зап",
    "number": 457,
    "parent": null
  },
  "unit-460-omrr-404-sd": {
    "dict_keys": ["460 омрр 404 сд"],
    "type": "омрр",
    "number": 460,
    "parent": "unit-404-sd"
  },
  "unit-467-kap": {
    "dict_keys": ["467 кап"],
    "type": "кап",
    "number": 467,
    "parent": null
  },
  "unit-51-a-659-olbs": {
    "dict_keys": ["51 А 659 олбс"],
    "type": "олбс",
    "number": 659,
    "parent": "unit-51-a"
  },
  "unit-55-mspb-55-tbr": {
    "dict_keys": ["55 мспб 55 тбр"],
    "type": "мспб",
    "number": 55,
    "parent": "unit-55-tbr"
  },
  "unit-133-iap-krymf": {
    "dict_keys": ["133 иап КрымФ", "КрымФ 133 иап"],
    "type": "иап",
    "number": 133,
    "parent": "unit-krymf-front"
  },
  "unit-rybinsko-yaroslav-div-rn-pvo": {
    "dict_keys": ["рыбинско-ярославский див. р-н ПВО"],
    "type": "див. р-н ПВО",
    "number": null,
    "parent": null
  },
  "unit-skf-13-otd-brone-rota": {
    "dict_keys": ["СКФ 13 отд. броне. рота"],
    "type": "отд. броне. рота",
    "number": 13,
    "parent": null
  },
  "unit-skf-133-med-san-bat-157-sd": {
    "dict_keys": ["СКФ 133 мед. сан. бат. 157 сд"],
    "type": "мед. сан. бат.",
    "number": 133,
    "parent": "unit-157-sd"
  },
  "unit-skf-138-sd-295-ap": {
    "dict_keys": ["скф 138 сд 295 ап"],
    "type": "ап",
    "number": 295,
    "parent": "unit-138-sd"
  },
  "unit-skf-18-gv-minp": {
    "dict_keys": ["СКФ 18 гв. минп"],
    "type": "гв. минп",
    "number": 18,
    "parent": null
  },
  "unit-skf-199-obs-157-div-tr": {
    "dict_keys": ["СКФ 199 обс 157 див. тр"],
    "type": "обс",
    "number": 199,
    "parent": "unit-157-sd"
  },
  "unit-skf-2-rota-427-olbs": {
    "dict_keys": ["СКФ 2 рота 427 олбс"],
    "type": "рота",
    "number": 2,
    "parent": "unit-427-olbs"
  },
  "unit-skf-205-osb-398-sd": {
    "dict_keys": ["скф 205 осб 398 сд"],
    "type": "осб",
    "number": 205,
    "parent": "unit-398-sd"
  },
  "unit-skf-25-gv-minp-223-gmd": {
    "dict_keys": ["скф 25 гв. минп 223 гмд"],
    "type": "гв. минп",
    "number": 25,
    "parent": "unit-223-gmd"
  },
  "unit-skf-28-optd-236-sd": {
    "dict_keys": ["скф 28 оптд 236 сд"],
    "type": "оптд",
    "number": 28,
    "parent": "unit-236-sd"
  },
  "unit-skf-3-rota-427-olbs": {
    "dict_keys": ["СКФ 3 рота 427 олбс"],
    "type": "рота",
    "number": 3,
    "parent": "unit-427-olbs"
  },
  "unit-skf-343-pulemetn-bat-151-ur": {
    "dict_keys": ["СКФ 343 пулеметн. бат. 151 УР"],
    "type": "пулеметн. бат.",
    "number": 343,
    "parent": "unit-151-ur"
  },
  "unit-skf-351-ozad": {
    "dict_keys": ["СКФ 351 озад"],
    "type": "озад",
    "number": 351,
    "parent": null
  },
  "unit-skf-404-otd-sap-bat-236-sd": {
    "dict_keys": ["скф 404 отд. сап. бат. 236 сд"],
    "type": "отд. сап. бат.",
    "number": 404,
    "parent": "unit-236-sd"
  },
  "unit-skf-44-a-39-tbr": {
    "dict_keys": ["скф 44 А 39 тбр"],
    "type": "тбр",
    "number": 39,
    "parent": "unit-44-a"
  },
  "unit-skf-47-arm-opo": {
    "dict_keys": ["скф 47 арм. опо"],
    "type": "арм. опо",
    "number": null,
    "parent": "unit-47-a"
  },
  "unit-skf-47-arm-polit-otd": {
    "dict_keys": ["скф 47 арм. полит. отд."],
    "type": "арм. полит. отд.",
    "number": null,
    "parent": "unit-47-a"
  },
  "unit-skf-492-otd-telegraf-stroit-rota": {
    "dict_keys": ["СКФ 492 отд. телеграф.-строит. рота связи"],
    "type": "отд. телеграф.-строит. рота",
    "number": 492,
    "parent": null
  },
  "unit-skf-51-a": {
    "dict_keys": ["скф 51 А"],
    "type": "А",
    "number": 51,
    "parent": null
  },
  "unit-skf-51-a-826-sp": {
    "dict_keys": ["скф 51 А 826 сп"],
    "type": "сп",
    "number": 826,
    "parent": "unit-51-a"
  },
  "unit-skf-51-a-958-ap": {
    "dict_keys": ["скф 51 А 958 ап"],
    "type": "ап",
    "number": 958,
    "parent": "unit-51-a"
  },
  "unit-skf-61-dorma": {
    "dict_keys": ["скф 61 дорма"],
    "type": "дорма",
    "number": 61,
    "parent": null
  },
  "unit-skf-676-osb": {
    "dict_keys": ["скф 676 осб"],
    "type": "осб",
    "number": 676,
    "parent": null
  },
  "unit-skf-73-otd-moto-meh-polk": {
    "dict_keys": ["СКФ 73 отд. мото. мех. полк"],
    "type": "отд. мото. мех. полк",
    "number": 73,
    "parent": null
  },
  "unit-skf-739-otsr": {
    "dict_keys": ["СКФ 739 отср"],
    "type": "отср",
    "number": 739,
    "parent": null
  },
  "unit-skf-75-otd-inzh-b": {
    "dict_keys": ["скф 75 отд. инж. б"],
    "type": "отд. инж. б",
    "number": 75,
    "parent": null
  },
  "unit-skf-763-otsr-398-sd": {
    "dict_keys": ["скф 763 отср 398 сд"],
    "type": "отср",
    "number": 763,
    "parent": "unit-398-sd"
  },
  "unit-skf-79-ps": {
    "dict_keys": ["СКФ 79 пс"],
    "type": "пс",
    "number": 79,
    "parent": null
  },
  "unit-skf-792-sp-390-sd": {
    "dict_keys": ["скф 792 сп 390 сд"],
    "type": "сп",
    "number": 792,
    "parent": "unit-390-sd"
  },
  "unit-skf-8-otd-77-gsd": {
    "dict_keys": ["скф 8 отд 77 гсд"],
    "type": "отд",
    "number": 8,
    "parent": "unit-77-gsd"
  },
  "unit-skf-865-sd-47-a": {
    "dict_keys": ["скф 865 сд 47 А"],
    "type": "сд",
    "number": 865,
    "parent": "unit-47-a"
  },
  "unit-skf-865-sp": {
    "dict_keys": ["СКФ 865 сп"],
    "type": "сп",
    "number": 865,
    "parent": null
  },
  "unit-skf-871-sp-276-sd-44-a": {
    "dict_keys": ["скф 871 сп 276 сд 44 А"],
    "type": "сп",
    "number": 871,
    "parent": "unit-276-sd"
  },
  "unit-skf-873-sp": {
    "dict_keys": ["СКФ 873 сп"],
    "type": "сп",
    "number": 873,
    "parent": null
  },
  "unit-skf-954-ap-390-sd": {
    "dict_keys": ["скф 954 ап 390 сд"],
    "type": "ап",
    "number": 954,
    "parent": "unit-390-sd"
  },
  "unit-skf-957-p-236-sd": {
    "dict_keys": ["скф 957 п 236 сд"],
    "type": "п",
    "number": 957,
    "parent": "unit-236-sd"
  },
  "unit-skf-obs": {
    "dict_keys": ["скф обс"],
    "type": "обс",
    "number": null,
    "parent": null
  },
  "unit-shtab-44-a-zakf": {
    "dict_keys": ["штаб 44 А ЗакФ"],
    "type": "штаб",
    "number": null,
    "parent": "unit-44-a"
  }
}
```

## Список 2: Структурированные пакеты (из массива structured)

Эти записи предназначены для автоматического создания иерархии «дивизия — полк» (и выше) одним проходом. В пакете bundle сначала идет родительская сущность (если ее еще нет), затем дочерняя.

```json
{
  "bundle-633-sp-157-sd": {
    "pair_key": "unit-633-sp|unit-157-sd",
    "bundle": [
      {
        "proposed_key": "unit-157-sd",
        "type": "дивизия",
        "number": 157,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-633-sp",
        "type": "полк",
        "number": 633,
        "parent": "unit-157-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["СКФ 633 сп 157 сд"],
    "count": 246
  },
  "bundle-821-sp-398-sd": {
    "pair_key": "unit-821-sp|unit-398-sd",
    "bundle": [
      {
        "proposed_key": "unit-821-sp",
        "type": "полк",
        "number": 821,
        "parent": "unit-398-sd",
        "new_division_in_bundle": false
      }
    ],
    "observed_values": ["СКФ 821 сп 398 сд", "скф 398 сд 821 сп"],
    "count": 90
  },
  "bundle-824-sp-398-sd": {
    "pair_key": "unit-824-sp|unit-398-sd",
    "bundle": [
      {
        "proposed_key": "unit-824-sp",
        "type": "полк",
        "number": 824,
        "parent": "unit-398-sd",
        "new_division_in_bundle": false
      }
    ],
    "observed_values": ["скф 398 сд 824 сп", "СКФ 824 сп 398 сд"],
    "count": 49
  },
  "bundle-384-sp-157-sd": {
    "pair_key": "unit-384-sp|unit-157-sd",
    "bundle": [
      {
        "proposed_key": "unit-157-sd",
        "type": "дивизия",
        "number": 157,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-384-sp",
        "type": "полк",
        "number": 384,
        "parent": "unit-157-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["СКФ 384 сп 157 сд"],
    "count": 23
  },
  "bundle-829-sp-400-sd": {
    "pair_key": "unit-829-sp|unit-400-sd",
    "bundle": [
      {
        "proposed_key": "unit-400-sd",
        "type": "дивизия",
        "number": 400,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-829-sp",
        "type": "полк",
        "number": 829,
        "parent": "unit-400-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 400 сд 829 сп"],
    "count": 17
  },
  "bundle-832-sp-400-sd": {
    "pair_key": "unit-832-sp|unit-400-sd",
    "bundle": [
      {
        "proposed_key": "unit-400-sd",
        "type": "дивизия",
        "number": 400,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-832-sp",
        "type": "полк",
        "number": 832,
        "parent": "unit-400-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 400 сд 832 сп"],
    "count": 16
  },
  "bundle-845-sp-236-sd": {
    "pair_key": "unit-845-sp|unit-236-sd",
    "bundle": [
      {
        "proposed_key": "unit-236-sd",
        "type": "дивизия",
        "number": 236,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-845-sp",
        "type": "полк",
        "number": 845,
        "parent": "unit-236-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 845 п 236 сд"],
    "count": 16
  },
  "bundle-716-sp-157-sd": {
    "pair_key": "unit-716-sp|unit-157-sd",
    "bundle": [
      {
        "proposed_key": "unit-157-sd",
        "type": "дивизия",
        "number": 157,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-716-sp",
        "type": "полк",
        "number": 716,
        "parent": "unit-157-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["СКФ 716 сп 157 сд"],
    "count": 15
  },
  "bundle-814-sp-236-sd": {
    "pair_key": "unit-814-sp|unit-236-sd",
    "bundle": [
      {
        "proposed_key": "unit-236-sd",
        "type": "дивизия",
        "number": 236,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-814-sp",
        "type": "полк",
        "number": 814,
        "parent": "unit-236-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 814 сп 236 сд"],
    "count": 13
  },
  "bundle-655-sp-404-sd": {
    "pair_key": "unit-655-sp|unit-404-sd",
    "bundle": [
      {
        "proposed_key": "unit-655-sp",
        "type": "полк",
        "number": 655,
        "parent": "unit-404-sd",
        "new_division_in_bundle": false
      }
    ],
    "observed_values": ["СКФ 655 сп 404 сд", "655 сп 404 сд", "655 сп 404 сд крымф"],
    "count": 12
  },
  "bundle-509-sp-236-sd": {
    "pair_key": "unit-509-sp|unit-236-sd",
    "bundle": [
      {
        "proposed_key": "unit-236-sd",
        "type": "дивизия",
        "number": 236,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-509-sp",
        "type": "полк",
        "number": 509,
        "parent": "unit-236-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 509 сп 236 сд", "скф 509 п 236 сд"],
    "count": 9
  },
  "bundle-652-sp-404-sd": {
    "pair_key": "unit-652-sp|unit-404-sd",
    "bundle": [
      {
        "proposed_key": "unit-652-sp",
        "type": "полк",
        "number": 652,
        "parent": "unit-404-sd",
        "new_division_in_bundle": false
      }
    ],
    "observed_values": ["СКФ 652 сп 404 сд"],
    "count": 6
  },
  "bundle-827-sp-302-sd": {
    "pair_key": "unit-827-sp|unit-302-sd",
    "bundle": [
      {
        "proposed_key": "unit-302-sd",
        "type": "дивизия",
        "number": 302,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-827-sp",
        "type": "полк",
        "number": 827,
        "parent": "unit-302-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 827 сп 302 сд"],
    "count": 6
  },
  "bundle-834-sp-400-sd": {
    "pair_key": "unit-834-sp|unit-400-sd",
    "bundle": [
      {
        "proposed_key": "unit-400-sd",
        "type": "дивизия",
        "number": 400,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-834-sp",
        "type": "полк",
        "number": 834,
        "parent": "unit-400-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 400 сд 834 сп"],
    "count": 5
  },
  "bundle-665-sp-404-sd": {
    "pair_key": "unit-665-sp|unit-404-sd",
    "bundle": [
      {
        "proposed_key": "unit-665-sp",
        "type": "полк",
        "number": 665,
        "parent": "unit-404-sd",
        "new_division_in_bundle": false
      }
    ],
    "observed_values": ["СКФ 665 сп 404 сд"],
    "count": 5
  },
  "bundle-105-sp-77-sd": {
    "pair_key": "unit-105-sp|unit-77-sd",
    "bundle": [
      {
        "proposed_key": "unit-77-sd",
        "type": "дивизия",
        "number": 77,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-105-sp",
        "type": "полк",
        "number": 105,
        "parent": "unit-77-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["СКФ 105 сп 77 сд", "СКФ 77 гсд 105 гсп", "СКФ 77 гсд 105 п", "СКФ 77 гсд 105 сп"],
    "count": 5
  },
  "bundle-789-sp-227-sd": {
    "pair_key": "unit-789-sp|unit-227-sd",
    "bundle": [
      {
        "proposed_key": "unit-227-sd",
        "type": "дивизия",
        "number": 227,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-789-sp",
        "type": "полк",
        "number": 789,
        "parent": "unit-227-sd",
        "new_division_in_bundle": true
      }
    ],
    "observed_values": ["скф 227 сд 789 сп"],
    "count": 3
  },
  "bundle-784-sp-390-sd": {
    "pair_key": "unit-784-sp|unit-390-sd",
    "bundle": [
      {
        "proposed_key": "unit-390-sd",
        "type": "дивизия",
        "number": 390,
        "parent": "unit-skf-front"
      },
      {
        "proposed_key": "unit-784-sp",
        "type": "полк",
        "number": 784,

```

---

## Записи из файла, которые упоминаются более 5 раз:

Записи из файла, которые упоминаются более 5 раз:

| Сокращение в CSV                       | Полное наименование                                                          | Частота |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| 276 сд                                 | 276 стрелковой дивизии                                                       | 371     |
| 157 сд                                 | 157 стрелковой дивизии                                                       | 248     |
| СКФ 633 сп 157 сд                      | Северо-Кавказского Фронта 633 стрелковый полк 157 стрелковой дивизии         | 246     |
| 15 гв. сп 2 гв. сд                     | 15 гв. стрелковый полк 2 гв. стрелковой дивизии                              | 132     |
| СКФ 821 сп 398 сд                      | Северо-Кавказского Фронта 821 стрелковый полк 398 стрелковой дивизии         | 90      |
| СКФ 958 ап 398 сд                      | Северо-Кавказского Фронта 958 артиллерийского полка 398 стрелковой дивизии   | 53      |
| скф 398 сд 824 сп                      | скф 398 стрелковой дивизии 824 стрелковый полк                               | 49      |
| штаб 55 тбр                            | штаб 55 танковой бригады                                                     | 40      |
| СКФ 384 сп 157 сд                      | Северо-Кавказского Фронта 384 стрелковый полк 157 стрелковой дивизии         | 23      |
| 957 окшр                               | 957 отдельной кабельно-шестовой роты                                         | 21      |
| СКФ 77 гсд                             | Северо-Кавказского Фронта 77 горнострелковой дивизии                         | 20      |
| скф 400 сд 829 сп                      | скф 400 стрелковой дивизии 829 стрелковый полк                               | 17      |
| СКФ 422 ап 157 сд                      | Северо-Кавказского Фронта 422 артиллерийского полка 157 стрелковой дивизии   | 17      |
| скф 400 сд 832 сп                      | скф 400 стрелковой дивизии 832 стрелковый полк                               | 16      |
| скф 845 п 236 сд                       | скф 845 полка (неуточн.) 236 стрелковой дивизии                              | 16      |
| СКФ 716 сп 157 сд                      | Северо-Кавказского Фронта 716 стрелковый полк 157 стрелковой дивизии         | 15      |
| скф 392 мед.-сан. бат.                 | скф 392 медико-санитарного батальона                                         | 13      |
| скф 47 А 47 оро                        | скф 47-й армии 47 отдельной роты охраны                                      | 13      |
| скф 814 сп 236 сд                      | скф 814 стрелковый полк 236 стрелковой дивизии                               | 13      |
| СКФ 195 кп 72 кд                       | Северо-Кавказского Фронта 195 кавалерийского полка 72 кавалерийской дивизии  | 12      |
| СКФ 220 отд. зен. арт. д н             | Северо-Кавказского Фронта 220 отдельного зенитного артиллерийского дивизиона | 11      |
| скф 47 А                               | скф 47 А                                                                     | 11      |
| СКФ 750 отд. инж. бат.                 | Северо-Кавказского Фронта 750 отдельного инженерного батальона               | 11      |
| 56 тбр                                 | 56 танковой бригады                                                          | 10      |
| СКФ 655 сп 404 сд                      | Северо-Кавказского Фронта 655 стрелковый полк 404 стрелковой дивизии         | 10      |
| скф 509 сп 236 сд                      | скф 509 стрелковый полк 236 стрелковой дивизии                               | 9       |
| 961 ап                                 | 961 артиллерийского полка                                                    | 8       |
| скф 276 сд 44 А                        | скф 276 стрелковой дивизии 44 А                                              | 8       |
| штаб 63 гсд                            | штаб 63 горнострелковой дивизии                                              | 8       |
| 633 сп                                 | 633 стрелковый полк                                                          | 7       |
| скф 398 сд 846 обс                     | скф 398 стрелковой дивизии 846 отдельного батальона связи                    | 6       |
| СКФ 652 сп 404 сд                      | Северо-Кавказского Фронта 652 стрелковый полк 404 стрелковой дивизии         | 6       |
| СКФ 77 сд                              | Северо-Кавказского Фронта 77 стрелковой дивизии                              | 6       |
| СКФ 793 отд. кабельн.-шест. рота связи | Северо-Кавказского Фронта 793 отд. кабельн.-шест. рота связи                 | 6       |
| скф 827 сп 302 сд                      | скф 827 стрелковый полк 302 стрелковой дивизии                               | 6       |

**Сложные моменты и аннотация к данным:**

1. **Неоднозначность типов (полк «п»):** В строке `скф 845 п 236 сд` тип указан как «полк (неуточн.)». В исходных данных это сокращение «п» может означать как стрелковый, так и прочий полк. Рекомендуется уточнить по архивной карточке (ЦАМО) и при необходимости разнести на `unit-845-sp` (если подтвердится стрелковый) или отдельный тип.
2. **Сдвоенные написания:** Для `СКФ 422 ап 157 сд` и `СКФ 157 сд 422 ап` (17 упоминаний) в реестре ключей необходимо указать оба варианта в массиве `dict_keys`, чтобы парсер ловил их независимо от порядка слов в CSV.
3. **Штабы соединений:** Записи `штаб 55 тбр` (40 упоминаний) и `штаб 63 гсд` (8 упоминаний) не являются боевыми частями. Для них в реестре целесообразно использовать `type: "штаб"` и явно указывать `parent` (родительскую бригаду или дивизию), чтобы не нарушать иерархию при автоматической сборке JSON.
4. **Специфические подразделения:** Сокращения вроде `оро` (рота охраны), `обс` (батальон связи), `зен. арт. д н` (зенитный дивизион) требуют строгого соблюдения регистра и точек в `dict_keys`, так как в исходных CSV они часто пишутся с вариациями (например, «зен. арт. д-н» против «зен. арт. д н»).

105-й стрелковый полк 77-й горнострелковой дивизии Северо-Кавказского фронта
