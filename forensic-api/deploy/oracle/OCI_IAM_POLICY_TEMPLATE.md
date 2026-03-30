# OCI IAM 정책 템플릿

이 프로젝트에서 Oracle Always Free VM을 만들고, 기존 네트워크를 사용하는 최소 권한 템플릿입니다.

출처:

- Common Policies:
  https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/commonpolicies.htm

## 1. 최소 실행 권한

```text
Allow group InstanceLaunchers to manage instance-family in compartment <APP_COMPARTMENT>
Allow group InstanceLaunchers to read app-catalog-listing in tenancy
Allow group InstanceLaunchers to use volume-family in compartment <APP_COMPARTMENT>
Allow group InstanceLaunchers to use virtual-network-family in compartment <NETWORK_COMPARTMENT>
Allow group InstanceLaunchers to manage compute-capacity-reports in tenancy
```

## 2. 네트워크까지 직접 생성하게 할 때만 추가

```text
Allow group NetworkAdmins to manage virtual-network-family in compartment <NETWORK_COMPARTMENT>
```

## 3. 콘솔 연결이 필요할 때

```text
Allow group InstanceLaunchers to manage instance-console-connection in tenancy
Allow group InstanceLaunchers to read instance in tenancy
```

## 4. 권한 검증 기준

- 인스턴스 생성 버튼이 보여야 함
- Availability Domain 조회 가능
- Shape 조회 가능
- 기존 VCN/Subnet 조회 가능
- 필요 시 NSG/보안목록 수정 가능

## 5. 최소 권한 원칙

- 앱과 네트워크 컴파트먼트를 분리
- `manage all-resources`는 피함
- 네트워크를 새로 만들 필요가 없으면 `use virtual-network-family`만 부여
